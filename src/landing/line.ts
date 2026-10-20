import { prefersReducedMotion } from "./ticker";

interface Pt {
  x: number;
  y: number;
}

function wiggle(w: number, h: number): string {
  const turns = Math.max(4, Math.round(h / 420));
  const step = h / turns;
  let d = `M ${w / 2} 0`;
  for (let i = 0; i < turns; i++) {
    const side = i % 2 ? 0.18 : 0.82;
    const y0 = i * step;
    d += ` C ${w * side} ${y0 + step * 0.3}, ${w * side} ${y0 + step * 0.7}, ${w / 2} ${y0 + step}`;
  }
  return d;
}

export function mountPencilLine(section: HTMLElement): () => void {
  const clip = section.querySelector<HTMLElement>("[data-pencil-clip]");
  const svg = clip?.querySelector<SVGSVGElement>("svg");
  const path = svg?.querySelector("path");
  const tip = section.querySelector<HTMLElement>("[data-pencil-tip]");
  if (!clip || !svg || !path) return () => {};
  const reduced = prefersReducedMotion();
  let samples: Pt[] = [];
  let top = 0;
  let left = 0;
  let height = 1;
  let docTop = 0;
  let queued = 0;
  let lastY = -1;

  const layout = () => {
    clip.style.transform = "";
    svg.style.transform = "";
    const w = Math.max(1, clip.clientWidth);
    height = Math.max(1, clip.clientHeight);
    svg.setAttribute("viewBox", `0 0 ${w} ${height}`);
    svg.removeAttribute("preserveAspectRatio");
    path.removeAttribute("vector-effect");
    path.removeAttribute("pathLength");
    path.setAttribute("d", wiggle(w, height));
    const total = path.getTotalLength();
    const n = Math.max(40, Math.round(total / 6));
    samples = Array.from({ length: n + 1 }, (_, i) => {
      const p = path.getPointAtLength((total * i) / n);
      return { x: p.x, y: p.y };
    });
    const c = clip.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    top = c.top - s.top;
    left = c.left - s.left;
    docTop = c.top + scrollY;
    lastY = -1;
  };

  const pointAt = (y: number): Pt => {
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].y < y) lo = mid + 1;
      else hi = mid;
    }
    return samples[lo];
  };

  const update = () => {
    queued = 0;
    const y = reduced ? height : Math.min(height, Math.max(0, scrollY + innerHeight * 0.6 - docTop));
    if (Math.abs(y - lastY) < 0.5) return;
    lastY = y;
    clip.style.transform = `translate3d(0, ${y - height}px, 0)`;
    svg.style.transform = `translate3d(0, ${height - y}px, 0)`;
    if (!tip) return;
    if (reduced || y <= 0 || y >= height) {
      tip.hidden = true;
      return;
    }
    const p = pointAt(y);
    tip.hidden = false;
    tip.style.transform = `translate3d(${left + p.x}px, ${top + p.y}px, 0)`;
  };

  const schedule = () => {
    if (!queued) queued = requestAnimationFrame(update);
  };

  const relayout = () => {
    layout();
    schedule();
  };

  layout();
  update();
  addEventListener("scroll", schedule, { passive: true });
  const ro = new ResizeObserver(relayout);
  ro.observe(section);

  return () => {
    removeEventListener("scroll", schedule);
    ro.disconnect();
    if (queued) cancelAnimationFrame(queued);
  };
}
