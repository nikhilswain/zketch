import type { BrushStyle, StrokeInput, StrokeLike } from "@/engine/types";
import { createCanvas } from "@/engine/render/canvasFactory";
import { renderStroke } from "@/engine/render/renderStroke";
import { mulberry, pickDoodles } from "./doodles/library";
import { landingRegistry, onBrushAssetsChanged, warmGrain, whenBrushesReady } from "./engine";
import { keepDrawing } from "./handoff";
import { getDoodleMode } from "./hero";
import { onFrame, prefersReducedMotion } from "./ticker";

interface PadBrush {
  brush: BrushStyle;
  size: number;
  opacity: number;
  taper: [number, number];
}

const BRUSHES: Record<string, PadBrush> = {
  pencil: { brush: "pencil", size: 4, opacity: 0.95, taper: [6, 10] },
  ink: { brush: "ink", size: 6, opacity: 1, taper: [10, 22] },
  watercolor: { brush: "watercolor", size: 30, opacity: 0.8, taper: [0, 0] },
  pine: { brush: "pine", size: 64, opacity: 1, taper: [0, 0] },
  eraser: { brush: "eraser", size: 26, opacity: 1, taper: [0, 0] },
};

export function mountPad(root: HTMLElement, opts: { keep: boolean } = { keep: true }): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-pad-canvas]")!;
  const empty = root.querySelector<HTMLElement>("[data-pad-empty]");
  const msg = root.querySelector<HTMLElement>("[data-pad-msg]");
  const ctx = canvas.getContext("2d")!;
  const reg = landingRegistry();
  const rand = mulberry((Date.now() * 31) >>> 0);
  let done = createCanvas(1, 1);
  let dctx = done.getContext("2d")!;
  let dpr = 1;
  let cssW = 1;
  let cssH = 1;
  const strokes: StrokeLike[] = [];
  let tool = "pencil";
  let color = "#23201c";
  let live: StrokeLike | null = null;
  let pointer = -1;
  let queued = 0;
  let count = 0;
  let replay: { list: StrokeLike[]; t0: number; next: number; stop: () => void } | null = null;

  const paint = (target: CanvasRenderingContext2D, s: StrokeLike) => {
    target.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderStroke(target, s, reg);
    target.setTransform(1, 0, 0, 1, 0, 0);
  };

  const rebuild = () => {
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, done.width, done.height);
    for (const s of strokes) paint(dctx, s);
  };

  const show = (extra?: StrokeLike | null) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(done, 0, 0);
    if (extra) paint(ctx, extra);
  };

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === cssW && h === cssH) return;
    cssW = w;
    cssH = h;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    done = createCanvas(canvas.width, canvas.height);
    dctx = done.getContext("2d")!;
    rebuild();
    show(live);
  };

  const setEmpty = () => {
    if (empty) empty.hidden = strokes.length > 0 || !!live;
  };

  const say = (text: string) => {
    if (msg) msg.textContent = text;
  };

  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * cssW,
      y: ((e.clientY - r.top) / r.height) * cssH,
      pressure: e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5,
    };
  };

  const schedule = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      show(live ? { ...live, points: live.points.slice() } : null);
    });
  };

  const finishReplay = () => {
    if (!replay) return;
    replay.stop();
    for (let i = replay.next; i < replay.list.length; i++) {
      strokes.push(replay.list[i]);
      paint(dctx, replay.list[i]);
    }
    replay = null;
    show();
  };

  const onDown = (e: PointerEvent) => {
    if (pointer !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return;
    finishReplay();
    e.preventDefault();
    pointer = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    const b = BRUSHES[tool];
    const input: StrokeInput = e.pointerType === "pen" ? "pen" : e.pointerType === "touch" ? "touch" : "mouse";
    const now = Date.now();
    live = {
      id: `pad-${now.toString(36)}-${count++}`,
      points: [point(e)],
      color: tool === "eraser" ? "#000000" : color,
      size: b.size,
      opacity: b.opacity,
      brushStyle: b.brush,
      timestamp: now,
      startTime: now,
      duration: 0,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      taperStart: b.taper[0],
      taperEnd: b.taper[1],
      input,
      live: true,
    };
    if (b.brush === "pencil") warmGrain();
    setEmpty();
    schedule();
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer || !live) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) live.points.push(point(ev));
    schedule();
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer || !live) return;
    pointer = -1;
    const s: StrokeLike = { ...live, live: false, duration: Math.max(16, Date.now() - live.startTime!) };
    if (s.points.length === 1) s.points.push({ ...s.points[0], x: s.points[0].x + 0.5 });
    live = null;
    strokes.push(s);
    paint(dctx, s);
    show();
    setEmpty();
    say("");
  };

  const clear = () => {
    finishReplay();
    strokes.length = 0;
    rebuild();
    show();
    setEmpty();
    say("");
  };

  const surprise = async () => {
    finishReplay();
    const [def] = pickDoodles(1, rand, new Set());
    const doodle = def.make(Math.floor(rand() * 1e6), getDoodleMode());
    const k = Math.min(cssW / doodle.w, cssH / doodle.h) * 0.62;
    const ox = rand() * (cssW - doodle.w * k);
    const oy = (cssH - doodle.h * k) / 2;
    const base = Date.now();
    const list = doodle.strokes.map((s, i) => ({
      ...s,
      id: `pad-${base.toString(36)}-${i}`,
      size: s.size * k,
      points: s.points.map((p) => ({ x: ox + p.x * k, y: oy + p.y * k, pressure: p.pressure })),
      startTime: base + s.startTime!,
      timestamp: base + s.startTime!,
    }));
    await whenBrushesReady(doodle);
    if (prefersReducedMotion()) {
      for (const s of list) {
        strokes.push(s);
        paint(dctx, s);
      }
      show();
      setEmpty();
      return;
    }
    const t0 = performance.now();
    const r = { list, t0, next: 0, stop: () => {} };
    replay = r;
    setEmpty();
    r.stop = onFrame((now) => {
      const t = base + (now - t0) * 1.4;
      while (r.next < list.length && list[r.next].startTime! + list[r.next].duration! <= t) {
        strokes.push(list[r.next]);
        paint(dctx, list[r.next]);
        r.next++;
      }
      const cur = list[r.next];
      if (!cur) {
        r.stop();
        replay = null;
        show();
        setEmpty();
        return;
      }
      const f = Math.max(0, (t - cur.startTime!) / cur.duration!);
      show(f > 0 ? { ...cur, id: `${cur.id}~`, points: cur.points.slice(0, Math.max(2, Math.ceil(cur.points.length * f))) } : null);
    });
  };

  const choose = (group: string, el: HTMLElement) => {
    for (const b of root.querySelectorAll<HTMLElement>(`[${group}]`)) b.setAttribute("aria-checked", String(b === el));
  };

  const onClick = async (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const brush = t.closest<HTMLElement>("[data-brush]");
    const swatch = t.closest<HTMLElement>("[data-color]");
    if (brush) {
      tool = brush.dataset.brush!;
      choose("data-brush", brush);
    } else if (swatch) {
      color = swatch.dataset.color!;
      choose("data-color", swatch);
      if (tool === "eraser") {
        const pencil = root.querySelector<HTMLElement>('[data-brush="pencil"]')!;
        tool = "pencil";
        choose("data-brush", pencil);
      }
    } else if (t.closest("[data-clear]")) {
      clear();
    } else if (t.closest("[data-surprise]")) {
      void surprise();
    } else if (t.closest("[data-keep]") && opts.keep) {
      finishReplay();
      if (!strokes.length) {
        location.assign("/draw");
        return;
      }
      say("saving your doodle…");
      const result = await keepDrawing(strokes, canvas);
      if (result === "storage-error") say("your browser won't let zketch save here (private mode?). open zketch in a normal window.");
    }
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  root.addEventListener("click", onClick);
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  const stopAssets = onBrushAssetsChanged(() => {
    rebuild();
    show(live);
  });
  fit();
  setEmpty();

  return () => {
    finishReplay();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    root.removeEventListener("click", onClick);
    ro.disconnect();
    stopAssets();
    if (queued) cancelAnimationFrame(queued);
  };
}
