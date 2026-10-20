import { prefersReducedMotion } from "./ticker";

function wiggle(w: number, h: number): string {
  const turns = Math.max(4, Math.round(h / 420));
  const step = h / turns;
  let d = `M ${w / 2} 0`;
  for (let i = 0; i < turns; i++) {
    const side = i % 2 ? 0.18 : 0.82;
    const y0 = i * step;
    const y1 = y0 + step;
    d += ` C ${w * side} ${y0 + step * 0.3}, ${w * side} ${y0 + step * 0.7}, ${w / 2} ${y1}`;
  }
  return d;
}

export function mountPencilLine(section: HTMLElement): () => void {
  const svg = section.querySelector<SVGSVGElement>("[data-pencil-line]");
  const path = svg?.querySelector("path");
  const tip = section.querySelector<HTMLElement>("[data-pencil-tip]");
  if (!svg || !path) return () => {};
  const reduced = prefersReducedMotion();
  let total = 1;
  let queued = 0;

  const layout = () => {
    const w = Math.max(1, svg.clientWidth);
    const h = Math.max(1, svg.clientHeight);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.removeAttribute("preserveAspectRatio");
    path.removeAttribute("vector-effect");
    path.removeAttribute("pathLength");
    path.setAttribute("d", wiggle(w, h));
    total = path.getTotalLength();
    path.style.strokeDasharray = `${total} ${total}`;
  };

  const update = () => {
    queued = 0;
    const r = svg.getBoundingClientRect();
    const p = reduced ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    path.style.strokeDashoffset = String(total * (1 - p));
    if (!tip) return;
    if (reduced || p <= 0 || p >= 1) {
      tip.hidden = true;
      return;
    }
    const pt = path.getPointAtLength(total * p);
    tip.hidden = false;
    const s = section.getBoundingClientRect();
    tip.style.transform = `translate(${r.left - s.left + pt.x}px, ${r.top - s.top + pt.y}px)`;
  };

  const schedule = () => {
    if (!queued) queued = requestAnimationFrame(update);
  };

  const onResize = () => {
    layout();
    schedule();
  };

  layout();
  update();
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(section);

  return () => {
    removeEventListener("scroll", schedule);
    removeEventListener("resize", onResize);
    ro.disconnect();
    if (queued) cancelAnimationFrame(queued);
  };
}
