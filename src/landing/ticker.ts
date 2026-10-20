type FrameFn = (now: number) => void;

const subscribers = new Set<FrameFn>();
let raf = 0;

function loop(now: number) {
  raf = 0;
  for (const fn of [...subscribers]) fn(now);
  schedule();
}

function schedule() {
  if (raf || !subscribers.size || document.hidden) return;
  raf = requestAnimationFrame(loop);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    schedule();
  });
}

export function onFrame(fn: FrameFn): () => void {
  subscribers.add(fn);
  schedule();
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

export function watchVisible(el: Element, fn: (visible: boolean) => void, margin = "120px"): () => void {
  const io = new IntersectionObserver((entries) => fn(entries[entries.length - 1].isIntersecting), { rootMargin: margin });
  io.observe(el);
  return () => io.disconnect();
}

const motion = typeof matchMedia === "undefined" ? null : matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReducedMotion(): boolean {
  return !!motion?.matches;
}

export const MAX_DRAWING = 2;
let drawing = 0;
const waiting: (() => void)[] = [];

export function requestDrawSlot(start: () => void, urgent = false): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    drawing++;
    start();
  };
  if (drawing < MAX_DRAWING) run();
  else if (urgent) waiting.unshift(run);
  else waiting.push(run);
  return () => {
    cancelled = true;
    const i = waiting.indexOf(run);
    if (i >= 0) waiting.splice(i, 1);
  };
}

export function releaseDrawSlot(): void {
  drawing = Math.max(0, drawing - 1);
  while (drawing < MAX_DRAWING && waiting.length) waiting.shift()!();
}

export function activeDrawing(): number {
  return drawing;
}

export function debugLanding(): boolean {
  try {
    return localStorage.getItem("zk-debug-landing") === "1";
  } catch {
    return false;
  }
}
