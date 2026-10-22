import { elementKind, type ElementLike, type StrokeLike } from "../types";
import { elementBounds, type Bounds } from "./elementBounds";
import { renderDrawLayer, type DrawLayerRenderOptions } from "./renderDrawLayer";

export const REVEAL_PAD = 8;

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function partialStroke<T extends { points: unknown[] }>(stroke: T, p: number): T {
  const count = Math.max(1, Math.floor(stroke.points.length * p));
  return { ...stroke, points: stroke.points.slice(0, count) };
}

export function renderRevealed(
  ctx: CanvasRenderingContext2D,
  el: ElementLike,
  p: number,
  label: ElementLike | undefined,
  opts: DrawLayerRenderOptions,
): { x: number; y: number } | null {
  const kind = elementKind(el);
  if (kind === "stroke") {
    const stroke = p < 1 ? partialStroke(el as StrokeLike, p) : (el as StrokeLike);
    renderDrawLayer(ctx, [stroke], opts);
    const last = stroke.points[stroke.points.length - 1];
    return last ? { x: last.x, y: last.y } : null;
  }
  const els = label ? [el, label] : [el];
  if (p >= 1) {
    renderDrawLayer(ctx, els, opts);
    return null;
  }
  const b = els.reduce<Bounds | null>((acc, e) => unionBounds(acc, elementBounds(e, opts.lookup)), null);
  if (!b) return null;
  const x = b.minX - REVEAL_PAD;
  const w = (b.maxX - b.minX + REVEAL_PAD * 2) * p;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, b.minY - REVEAL_PAD, w, b.maxY - b.minY + REVEAL_PAD * 2);
  ctx.clip();
  renderDrawLayer(ctx, els, opts);
  ctx.restore();
  return { x: x + w, y: (b.minY + b.maxY) / 2 };
}
