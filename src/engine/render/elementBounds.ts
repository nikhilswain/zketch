import type { ArrowElementLike, ElementLike, ShapeElementLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import { curveBounds, headSize, resolveArrow } from "../geometry/arrow";
import { textPlacement } from "../geometry/labels";
import { boxBounds, shapeBox } from "../geometry/outline";
import { measureText } from "./fonts";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function elementBounds(el: ElementLike, lookup?: Map<string, ElementLike>): Bounds | null {
  const kind = elementKind(el);
  if (kind === "shape") {
    const s = el as ShapeElementLike;
    const b = boxBounds(shapeBox(s));
    const hw = (s.strokeWidth ?? 0) / 2;
    return { minX: b.minX - hw, minY: b.minY - hw, maxX: b.maxX + hw, maxY: b.maxY + hw };
  }
  if (kind === "arrow") {
    const a = el as ArrowElementLike;
    const b = curveBounds(resolveArrow(a, lookup, measureText));
    const pad = a.strokeWidth / 2 + (a.startHead !== "none" || a.endHead !== "none" ? headSize(a.strokeWidth) : 0);
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }
  if (kind === "text") {
    const placement = textPlacement(el as TextElementLike, lookup, measureText);
    return placement ? boxBounds(placement.box) : null;
  }
  const stroke = el as any;
  if (stroke.brushStyle === "eraser" || !stroke.points?.length) return null;
  const half = (stroke.size ?? 0) / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x - half < minX) minX = p.x - half;
    if (p.y - half < minY) minY = p.y - half;
    if (p.x + half > maxX) maxX = p.x + half;
    if (p.y + half > maxY) maxY = p.y + half;
  }
  return { minX, minY, maxX, maxY };
}
