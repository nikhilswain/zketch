import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { parseBackup } from "@/services/BackupService";
import { onBrushAssetsChanged } from "@/engine/stamp/assets";
import { ReplayRenderer, shareFrame } from "@/share/ReplayRenderer";
import { autoSpeed } from "@/share/replay";
import { readShareText } from "@/share/shareText";
import type { ShareMeta } from "@/share/shareServer";
import { sliceAt, stripLayout, timeSlices, type StripBox, type TimeSlice } from "@/share/timeStrip";
import { Pencil } from "./SharePlayer";

interface EmbedPlayerProps {
  meta: ShareMeta;
  mode: "tap" | "auto";
  loop: boolean;
}

type Loaded = { drawing: ISavedDrawingData; blobs: Map<string, Blob> };

const MAX_LONG_SIDE = 2048;
const LOOP_PAUSE_MS = 1200;
const STRIP_H = 16;
const BAR_H = 7;
const NOW_H = 12;
const BAR_BOTTOM = 14;
const UNPLAYED = 0.22;
const STRIP_ROW = 24;
const DRAG_PX = 4;
const STEP_MS = 1000;

type Drag = { id: number; x: number; moved: boolean; strip: boolean };

function roundBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(2, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

export const EmbedCredit: React.FC<{ id: string }> = ({ id }) => (
  <a
    href={`/share/${id}`}
    target="_blank"
    rel="noopener"
    className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#6f695f] no-underline hover:text-[#1b1d21]"
  >
    <i className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff6b5b]" />
    zketch
  </a>
);

const EmbedPlayer: React.FC<EmbedPlayerProps> = ({ meta, mode, loop }) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const pencilRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<ReplayRenderer | null>(null);
  const st = useRef({
    t: 0,
    total: 0,
    raf: 0,
    from: 0,
    t0: 0,
    loopTimer: 0,
    visible: false,
    playing: false,
    slices: [] as TimeSlice[],
    boxes: [] as StripBox[],
    stripW: 0,
    stripShown: false,
    stripKey: "",
    scrubRaf: 0,
    scrubT: 0,
    drag: null as Drag | null,
  }).current;
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const pictureUrl = `/api/shares/${meta.id}/picture.png`;
  const frame = useMemo(
    () =>
      loaded
        ? shareFrame(loaded.drawing)
        : { x: 0, y: 0, width: meta.previewWidth || 4, height: meta.previewHeight || 3 },
    [loaded, meta.previewWidth, meta.previewHeight],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch(`/api/shares/${meta.id}`);
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const backup = parseBackup(await readShareText(response));
        const drawing = backup.drawings[0];
        if (!drawing) throw new Error("No drawing in the share");
        if (live) setLoaded({ drawing, blobs: new Map(backup.blobs.map((b) => [b.id, b.blob])) });
      } catch (err) {
        console.error("Failed to load the embedded drawing:", err);
      }
    })();
    return () => {
      live = false;
    };
  }, [meta.id]);

  const stripKey = (): string => {
    let played = 0;
    let now = -1;
    st.slices.forEach((s, i) => {
      if (st.t >= s.end) played = i + 1;
      else if (st.playing && st.t >= s.start && now < 0) now = i;
    });
    const dpr = window.devicePixelRatio || 1;
    return `${st.slices.length}:${played}:${now}:${st.stripW}:${dpr}`;
  };

  const drawStrip = (force = false) => {
    const canvas = stripRef.current;
    if (!canvas || (!force && !st.stripShown)) return;
    const key = stripKey();
    if (!force && key === st.stripKey) return;
    st.stripKey = key;
    const dpr = window.devicePixelRatio || 1;
    const width = st.stripW;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.round(STRIP_H * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, STRIP_H);
    const slices = st.slices;
    const gap = slices.length > 0 && width / slices.length >= 6 ? 2 : 1;
    st.boxes = stripLayout(slices, width, gap);
    slices.forEach((s, i) => {
      const box = st.boxes[i];
      const now = st.playing && st.t >= s.start && st.t < s.end;
      const played = st.t >= s.end || now;
      const bar = now ? NOW_H : BAR_H;
      ctx.globalAlpha = played ? 1 : UNPLAYED;
      ctx.fillStyle = s.color;
      roundBar(ctx, box.x, BAR_BOTTOM - bar, Math.max(1, box.w), bar);
    });
    ctx.globalAlpha = 1;
  };

  const hidePencil = () => {
    if (pencilRef.current) pencilRef.current.style.opacity = "0";
  };

  const show = (t: number) => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;
    st.t = t;
    const { tip } = renderer.draw(t);
    const pencil = pencilRef.current;
    if (tip && pencil) {
      pencil.style.left = `${(tip.x / canvas.width) * 100}%`;
      pencil.style.top = `${(tip.y / canvas.height) * 100}%`;
      pencil.style.opacity = "1";
    }
    drawStrip();
  };

  const setPlay = (on: boolean) => {
    st.playing = on;
    setPlaying(on);
  };

  const halt = () => {
    cancelAnimationFrame(st.raf);
    st.raf = 0;
    window.clearTimeout(st.loopTimer);
    st.loopTimer = 0;
    cancelAnimationFrame(st.scrubRaf);
    st.scrubRaf = 0;
  };

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const run = (from: number) => {
    if (!rendererRef.current || st.total <= 0) return;
    halt();
    hidePencil();
    st.from = Math.max(0, Math.min(st.total, from));
    st.t0 = performance.now();
    setPlay(true);
    const speed = autoSpeed(st.total);
    const step = (now: number) => {
      const t = Math.min(st.total, st.from + (now - st.t0) * speed);
      show(t);
      if (t < st.total) {
        st.raf = requestAnimationFrame(step);
        return;
      }
      st.raf = 0;
      hidePencil();
      setPlay(false);
      drawStrip();
      if (mode === "auto" && loop && st.visible && !reduced()) {
        st.loopTimer = window.setTimeout(() => {
          st.loopTimer = 0;
          if (st.visible) run(0);
        }, LOOP_PAUSE_MS);
      }
    };
    show(st.from);
    st.raf = requestAnimationFrame(step);
  };

  const seek = (t: number) => {
    halt();
    show(Math.max(0, Math.min(st.total, t)));
  };

  const scrubTo = (clientX: number, strip: boolean) => {
    const el = strip ? stripRef.current : canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const k = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    st.scrubT = k * st.total;
    if (st.scrubRaf) return;
    st.scrubRaf = requestAnimationFrame(() => {
      st.scrubRaf = 0;
      seek(st.scrubT);
    });
  };

  const stop = () => {
    halt();
    hidePencil();
    setPlay(false);
    show(st.total);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!loaded || !canvas) return;
    const shown = stageRef.current?.getBoundingClientRect().width || frame.width;
    const wanted = (shown * (window.devicePixelRatio || 1)) / frame.width;
    const scale = Math.min(wanted, MAX_LONG_SIDE / Math.max(frame.width, frame.height));
    const renderer = new ReplayRenderer(canvas, loaded.drawing, scale, loaded.blobs);
    rendererRef.current = renderer;
    st.total = renderer.replay.total;
    st.t = st.total;
    st.slices = timeSlices(renderer.replay, loaded.drawing.layers);
    setTotal(st.total);
    let live = true;
    let prepared = false;
    let repaint = 0;
    renderer
      .ready()
      .then(() => {
        if (!live) return;
        prepared = true;
        renderer.draw(st.total);
        drawStrip(true);
        setReady(true);
      })
      .catch((err) => console.error("Failed to prepare the replay:", err));
    const stopAssets = onBrushAssetsChanged(() => {
      if (!prepared || repaint) return;
      repaint = requestAnimationFrame(() => {
        repaint = 0;
        if (live && st.raf === 0) renderer.draw(st.t);
      });
    });
    return () => {
      live = false;
      stopAssets();
      cancelAnimationFrame(repaint);
      halt();
      rendererRef.current = null;
      renderer.dispose();
      st.slices = [];
      setReady(false);
      setPlay(false);
    };
  }, [loaded, frame]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(([entry]) => {
      st.stripW = entry.contentRect.width;
      drawStrip(true);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!ready || !root || mode !== "auto") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.intersectionRatio >= 0.49;
        if (visible === st.visible) return;
        st.visible = visible;
        if (!visible) stop();
        else if (!st.playing && !reduced()) run(0);
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      st.visible = false;
    };
  }, [ready, mode, loop]);

  const watchable = ready && total > 0;

  const onDown = (e: React.PointerEvent<HTMLElement>, strip: boolean) => {
    if (!watchable || e.button !== 0) return;
    st.drag = { id: e.pointerId, x: e.clientX, moved: false, strip };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = st.drag;
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < DRAG_PX) return;
      drag.moved = true;
      halt();
      hidePencil();
      setPlay(false);
      setScrubbing(true);
    }
    scrubTo(e.clientX, drag.strip);
  };

  const onUp = (e: React.PointerEvent<HTMLElement>, tapped: boolean) => {
    const drag = st.drag;
    if (!drag || drag.id !== e.pointerId) return;
    st.drag = null;
    if (drag.moved) {
      cancelAnimationFrame(st.scrubRaf);
      st.scrubRaf = 0;
      seek(st.scrubT);
      setScrubbing(false);
      if (!tapped) {
        hidePencil();
        drawStrip();
      } else if (st.t < st.total) run(st.t);
      else {
        hidePencil();
        drawStrip();
      }
    } else if (tapped) {
      if (!drag.strip) {
        run(0);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const i = sliceAt(st.boxes, e.clientX - rect.left);
      if (i >= 0) run(st.slices[i].start);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!watchable) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      run(0);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setPlay(false);
      setScrubbing(true);
      seek(st.t + (e.key === "ArrowLeft" ? -STEP_MS : STEP_MS));
    }
  };

  const onBlur = () => {
    if (scrubbing && !st.drag) {
      hidePencil();
      setScrubbing(false);
    }
  };

  const stripOn = watchable && (playing || hovering || scrubbing);
  st.stripShown = stripOn;

  useEffect(() => {
    if (stripOn) drawStrip(true);
  }, [stripOn]);
  const pillText = mode === "auto" && playing ? "▶ drawing…" : "▶ watch it drawn";
  const pillOn = watchable && !scrubbing && (!playing || mode === "auto");
  const ratio = frame.width / frame.height;

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col font-ui select-none"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
        <div
          data-share-stage
          className="flex flex-col overflow-hidden rounded-[8px] bg-white"
          style={{ width: `min(100cqw, calc((100cqh - ${STRIP_ROW}px) * ${ratio}))` }}
        >
          <div
            ref={stageRef}
            tabIndex={watchable ? 0 : -1}
            role={watchable ? "button" : "img"}
            aria-label={watchable ? `${meta.name}, play how it was drawn` : meta.name}
            className={`relative w-full overflow-hidden bg-white outline-none focus-visible:ring-2 focus-visible:ring-zk-accent focus-visible:ring-inset ${watchable ? "cursor-pointer" : ""}`}
            style={{ aspectRatio: `${frame.width} / ${frame.height}`, touchAction: "pan-y" }}
            onPointerDown={(e) => onDown(e, false)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, true)}
            onPointerCancel={(e) => onUp(e, false)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          >
            <canvas ref={canvasRef} className={`block h-full w-full ${ready ? "" : "invisible"}`} />
            {!ready && (
              <img
                src={pictureUrl}
                alt={meta.name}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}
            <span
              ref={pencilRef}
              aria-hidden="true"
              className="pointer-events-none absolute h-0 w-0 opacity-0 transition-opacity duration-150"
            >
              <Pencil />
            </span>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-2 left-2.5 rounded-full bg-[#fffdf8d9] px-2 py-0.5 text-[12px] text-[#6f695f] transition-opacity duration-200 ${pillOn ? "opacity-100" : "opacity-0"}`}
            >
              {pillText}
            </span>
          </div>
        <div className="flex h-6 shrink-0 items-center gap-3 px-2.5">
          <canvas
            ref={stripRef}
            aria-hidden="true"
            onPointerDown={(e) => onDown(e, true)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, true)}
            onPointerCancel={(e) => onUp(e, false)}
            className={`h-4 min-w-0 flex-1 cursor-pointer transition-opacity duration-200 ${stripOn ? "opacity-100" : "pointer-events-none opacity-0"}`}
          />
          <EmbedCredit id={meta.id} />
        </div>
        </div>
      </div>
    </div>
  );
};

export default EmbedPlayer;
