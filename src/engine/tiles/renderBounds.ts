import type { ElementLike, StrokeLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import { brushRegistry } from "../render/BrushRegistry";
import { elementBounds } from "../render/elementBounds";
import { measureText } from "../render/fonts";
import type { ElementLookup } from "../render/lookup";
import { labelPlacement } from "../geometry/labels";
import { boxBounds } from "../geometry/outline";
import type { StampBrush } from "../stamp/StampBrush";
import { pad, union, type Bounds } from "./tileMath";

const strokeCache = new WeakMap<object, Bounds | null>();

function strokeBounds(s: StrokeLike): Bounds | null {
  if (!s.points?.length) return null;
  const spec = (brushRegistry.get(s.brushStyle) as StampBrush | undefined)?.spec;
  const reach = (spec?.scatter ?? 0) * (spec?.scatterBothAxes ? 1.42 : 1);
  const size = s.size ?? 0;
  const blur = s.brushStyle === "airbrush" ? size * (s.softness ?? 0.5) : 0;
  const p = size * (1.5 + reach) + blur + 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of s.points) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return pad({ minX, minY, maxX, maxY }, p);
}

export function renderBounds(
  el: ElementLike,
  lookup: ElementLookup,
  label?: TextElementLike | null,
): Bounds | null {
  const kind = elementKind(el);
  if (kind === "stroke") {
    if (strokeCache.has(el)) return strokeCache.get(el)!;
    const b = strokeBounds(el as StrokeLike);
    strokeCache.set(el, b);
    return b;
  }
  const base = elementBounds(el, lookup);
  if (kind === "text") return base ? pad(base, 4) : null;
  const width = (el as { strokeWidth?: number }).strokeWidth ?? 0;
  let b = base ? pad(base, width * 2 + 8) : null;
  if (label?.text) {
    const placement = labelPlacement(el, label, lookup, measureText);
    if (placement) {
      const lb = pad(boxBounds(placement.box), 4);
      b = b ? union(b, lb) : lb;
    }
  }
  return b;
}
