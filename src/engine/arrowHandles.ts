import type { PanZoom } from "./types";
import type { ResolvedArrow } from "./geometry/arrow";
import type { Vec } from "./geometry/outline";
import { overlayAccent } from "./render/overlayColor";

export type ArrowHandle = "start" | "end" | "mid";

export const ARROW_HANDLE_RADIUS = 7;

export function arrowHandlePositions(r: ResolvedArrow): Record<ArrowHandle, Vec> {
  return { start: r.start, end: r.end, mid: r.mid };
}

export function hitArrowHandle(r: ResolvedArrow, p: Vec, zoom: number): ArrowHandle | null {
  const radius = (ARROW_HANDLE_RADIUS + 3) / zoom;
  const pos = arrowHandlePositions(r);
  for (const h of ["start", "end", "mid"] as const) {
    if (Math.hypot(p.x - pos[h].x, p.y - pos[h].y) <= radius) return h;
  }
  return null;
}

export function renderArrowHandles(ctx: CanvasRenderingContext2D, r: ResolvedArrow, pz: PanZoom) {
  const toScreen = (p: Vec) => ({ x: p.x * pz.zoom + pz.panX, y: p.y * pz.zoom + pz.panY });
  const s = toScreen(r.start);
  const e = toScreen(r.end);
  const c = toScreen(r.control);
  const m = toScreen(r.mid);
  ctx.save();
  ctx.strokeStyle = overlayAccent();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.quadraticCurveTo(c.x, c.y, e.x, e.y);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [s, e]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, ARROW_HANDLE_RADIUS - 1, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(m.x, m.y, ARROW_HANDLE_RADIUS - 2, 0, Math.PI * 2);
  ctx.fillStyle = overlayAccent();
  ctx.fill();
  ctx.restore();
}
