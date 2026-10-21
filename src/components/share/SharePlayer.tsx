import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type React from "react";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { ReplayRenderer, shareFrame } from "@/share/ReplayRenderer";
import { autoSpeed, nextSpeedMode, speedFor, type Replay, type SpeedMode } from "@/share/replay";

export interface SharePlayerHandle {
  getRenderer(): ReplayRenderer | null;
  getSpeed(): number;
}

interface SharePlayerProps {
  drawing: ISavedDrawingData;
  pictureUrl: string;
  name: string;
  blobs?: Map<string, Blob>;
}

type Phase = "idle" | "tease" | "play" | "scrub" | "paused";

type Drag = { id: number; x: number; moved: boolean };

const TEASE_EVERY_MS = 5000;
const TEASE_WINDOW_MS = 1500;
const TEASE_MAX_ITEMS = 3;
const DRAG_PX = 4;
const STEP_MS = 1000;
const MAX_LONG_SIDE = 2048;

export function stageSize(width: number, height: number): React.CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, calc(60vh * ${width / height}))`,
  };
}

function teaseStart(replay: Replay): number {
  const { items, total } = replay;
  if (items.length === 0) return total;
  const recent = items.filter((i) => i.start >= total - TEASE_WINDOW_MS).length;
  const n = Math.min(TEASE_MAX_ITEMS, Math.max(1, recent));
  return items[items.length - n].start;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function times(n: number): string {
  return String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
}

function speedLabel(mode: SpeedMode, total: number): string {
  if (mode === "real") return "1×";
  if (mode === "fast") return "2× auto";
  return `auto ${times(autoSpeed(total))}×`;
}

const Pencil: React.FC = () => (
  <svg
    width="24"
    height="25.5"
    viewBox="-1 -13 16 17"
    className="absolute overflow-visible drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
    style={{ left: -1.5, top: -19.5 }}
  >
    <g transform="rotate(18)">
      <path d="M0 0 L5 -14 L11 -11 L4 2 Z" fill="#f2b33d" stroke="#2b2925" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M0 0 L2 -5 L4 -4 Z" fill="#2b2925" />
    </g>
  </svg>
);

const SharePlayer = forwardRef<SharePlayerHandle, SharePlayerProps>(({ drawing, pictureUrl, name, blobs }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pencilRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<ReplayRenderer | null>(null);
  const st = useRef({
    phase: "idle" as Phase,
    mode: "auto" as SpeedMode,
    t: 0,
    total: 0,
    raf: 0,
    scrubRaf: 0,
    scrubT: 0,
    from: 0,
    t0: 0,
    played: false,
    visible: false,
    drag: null as Drag | null,
  }).current;
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [mode, setMode] = useState<SpeedMode>("auto");
  const frame = useMemo(() => shareFrame(drawing), [drawing]);

  useImperativeHandle(
    ref,
    () => ({ getRenderer: () => rendererRef.current, getSpeed: () => speedFor(st.mode, st.total) }),
    [],
  );

  const setPhase = (p: Phase) => {
    st.phase = p;
    setPhaseState(p);
  };

  const updateClock = () => {
    const speed = speedFor(st.mode, st.total);
    if (clockRef.current) clockRef.current.textContent = `${clock(st.t / speed)} / ${clock(st.total / speed)}`;
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
    updateClock();
  };

  const halt = () => {
    cancelAnimationFrame(st.raf);
    st.raf = 0;
    cancelAnimationFrame(st.scrubRaf);
    st.scrubRaf = 0;
  };

  const run = (from: number, kind: "play" | "tease") => {
    halt();
    hidePencil();
    st.from = from;
    st.t0 = performance.now();
    setPhase(kind);
    const step = (now: number) => {
      const speed = st.phase === "tease" ? autoSpeed(st.total) : speedFor(st.mode, st.total);
      const t = Math.min(st.total, st.from + (now - st.t0) * speed);
      show(t);
      if (t < st.total) {
        st.raf = requestAnimationFrame(step);
      } else {
        st.raf = 0;
        hidePencil();
        setPhase("idle");
      }
    };
    show(from);
    st.raf = requestAnimationFrame(step);
  };

  const canPlay = () => ready && rendererRef.current !== null && st.total > 0;

  const play = () => {
    if (!canPlay()) return;
    st.played = true;
    run(0, "play");
  };

  const seek = (t: number) => {
    halt();
    st.played = true;
    show(Math.max(0, Math.min(st.total, t)));
  };

  const scrubTo = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    st.scrubT = k * st.total;
    if (st.scrubRaf) return;
    st.scrubRaf = requestAnimationFrame(() => {
      st.scrubRaf = 0;
      seek(st.scrubT);
    });
  };

  const cycleSpeed = () => {
    const next = nextSpeedMode(st.mode);
    st.from = st.t;
    st.t0 = performance.now();
    st.mode = next;
    setMode(next);
    updateClock();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shown = stageRef.current?.getBoundingClientRect().width || frame.width;
    const wanted = (shown * (window.devicePixelRatio || 1)) / frame.width;
    const scale = Math.min(wanted, MAX_LONG_SIDE / Math.max(frame.width, frame.height));
    const renderer = new ReplayRenderer(canvas, drawing, scale, blobs);
    rendererRef.current = renderer;
    st.total = renderer.replay.total;
    st.t = st.total;
    setTotal(st.total);
    let live = true;
    renderer
      .ready()
      .then(() => {
        if (!live) return;
        renderer.draw(st.total);
        setReady(true);
      })
      .catch((err) => console.error("Failed to prepare the replay:", err));
    return () => {
      live = false;
      halt();
      rendererRef.current = null;
      renderer.dispose();
      setReady(false);
      setPhase("idle");
    };
  }, [drawing, blobs, frame]);

  useEffect(() => {
    const stage = stageRef.current;
    const renderer = rendererRef.current;
    if (!ready || !stage || !renderer || st.total <= 0) return;
    const from = teaseStart(renderer.replay);
    renderer.keep(from);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(
      ([entry]) => {
        st.visible = entry.intersectionRatio >= 0.49;
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(stage);
    const timer = window.setInterval(() => {
      if (st.played || !st.visible || motion.matches || document.hidden || st.phase !== "idle") return;
      run(from, "tease");
    }, TEASE_EVERY_MS);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [ready]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPlay() || e.button !== 0) return;
    st.drag = { id: e.pointerId, x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = st.drag;
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < DRAG_PX) return;
      drag.moved = true;
      halt();
      hidePencil();
      setPhase("scrub");
    }
    scrubTo(e.clientX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, tapped: boolean) => {
    const drag = st.drag;
    if (!drag || drag.id !== e.pointerId) return;
    st.drag = null;
    if (drag.moved) {
      hidePencil();
      setPhase("paused");
    } else if (tapped) {
      play();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!canPlay()) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      play();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      seek(st.t + (e.key === "ArrowLeft" ? -STEP_MS : STEP_MS));
      setPhase("scrub");
    }
  };

  const onBlur = () => {
    if (st.phase === "scrub" && !st.drag) {
      hidePencil();
      setPhase("paused");
    }
  };

  const watchable = total > 0;
  const tagOn = phase === "play" || phase === "scrub";

  return (
    <div
      ref={stageRef}
      data-share-stage
      className={`relative overflow-hidden rounded-[4px] bg-white shadow-(--zk-shadow-share) select-none ${ready && watchable ? "cursor-pointer" : ""}`}
      style={{ ...stageSize(frame.width, frame.height), touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={watchable ? `${name}, tap to watch it being drawn` : name}
        className={`block h-full w-full rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-zk-accent focus-visible:ring-inset ${ready ? "" : "invisible"}`}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {!ready && (
        <img
          src={pictureUrl}
          alt={name}
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
      <div
        aria-hidden={!tagOn}
        className={`absolute top-2 right-2.5 flex items-center gap-1 rounded-[4px] bg-white/85 px-1.5 py-0.5 font-['JetBrains_Mono',ui-monospace,monospace] text-[11px] text-[#6a6f78] transition-opacity duration-200 ${tagOn ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span ref={clockRef}>0:00 / 0:00</span>
        <span>·</span>
        <button
          type="button"
          tabIndex={tagOn ? 0 : -1}
          className="rounded-[3px] px-0.5 hover:bg-black/5 hover:text-[#1b1d21]"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={cycleSpeed}
        >
          {speedLabel(mode, total)}
        </button>
      </div>
    </div>
  );
});

SharePlayer.displayName = "SharePlayer";

export default SharePlayer;
