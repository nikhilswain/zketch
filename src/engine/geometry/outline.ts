import type { ElementLike, ShapeElementLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import { layoutText, type Measure } from "./textLayout";

export type Vec = { x: number; y: number };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export const boxCenter = (b: Box): Vec => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function toLocal(b: Box, p: Vec): Vec {
  const c = boxCenter(b);
  const a = (-b.rotation * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function toWorld(b: Box, p: Vec): Vec {
  const c = boxCenter(b);
  const a = (b.rotation * Math.PI) / 180;
  return { x: c.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: c.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
}

export function pointInBox(b: Box, p: Vec, pad = 0) {
  const l = toLocal(b, p);
  return Math.abs(l.x) <= b.width / 2 + pad && Math.abs(l.y) <= b.height / 2 + pad;
}

export function boxCorners(b: Box): Vec[] {
  const w = b.width / 2;
  const h = b.height / 2;
  return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ].map((p) => toWorld(b, p));
}

export function boxBounds(b: Box) {
  const pts = boxCorners(b);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function freeTextBox(t: TextElementLike, measure: Measure): Box {
  const layout = layoutText(t.text, t.fontSize, t.fontFamily, null, measure);
  return { x: t.x, y: t.y, width: layout.width, height: layout.height, rotation: t.rotation ?? 0 };
}

export function shapeBox(s: ShapeElementLike): Box {
  return { x: s.x, y: s.y, width: s.width, height: s.height, rotation: s.rotation ?? 0 };
}

export function isBindable(el: ElementLike | undefined | null): el is ShapeElementLike | TextElementLike {
  if (!el) return false;
  const kind = elementKind(el);
  return kind === "shape" || (kind === "text" && !(el as TextElementLike).containerId);
}

export function bindableBox(el: ShapeElementLike | TextElementLike, measure: Measure): Box {
  return elementKind(el) === "shape" ? shapeBox(el as ShapeElementLike) : freeTextBox(el as TextElementLike, measure);
}

function polygonFor(el: ShapeElementLike | TextElementLike, w: number, h: number): Vec[] | null {
  if (elementKind(el) === "text") return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ];
  switch ((el as ShapeElementLike).shapeType) {
    case "circle":
      return null;
    case "diamond":
      return [
        { x: 0, y: -h },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: -w, y: 0 },
      ];
    case "triangle":
      return [
        { x: 0, y: -h },
        { x: w, y: h },
        { x: -w, y: h },
      ];
    default:
      return [
        { x: -w, y: -h },
        { x: w, y: -h },
        { x: w, y: h },
        { x: -w, y: h },
      ];
  }
}

function rayPolygon(d: Vec, poly: Vec[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (a.x * ey - a.y * ex) / den;
    const u = (a.x * d.y - a.y * d.x) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

export function outlinePoint(
  el: ShapeElementLike | TextElementLike,
  toward: Vec,
  gap: number,
  measure: Measure,
): Vec {
  const box = bindableBox(el, measure);
  const local = toLocal(box, toward);
  const len = Math.hypot(local.x, local.y);
  if (len < 1e-6) return boxCenter(box);
  const d = { x: local.x / len, y: local.y / len };
  const w = Math.max(0.5, box.width / 2);
  const h = Math.max(0.5, box.height / 2);
  const poly = polygonFor(el, w, h);
  const t = poly ? rayPolygon(d, poly) : 1 / Math.sqrt((d.x * d.x) / (w * w) + (d.y * d.y) / (h * h));
  return toWorld(box, { x: d.x * (t + gap), y: d.y * (t + gap) });
}
