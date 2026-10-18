import type { ArrowElementLike, ArrowHead, ElementLike } from "../types";
import { bindableBox, boxCenter, isBindable, outlinePoint, type Vec } from "./outline";
import type { Measure } from "./textLayout";

export interface ResolvedArrow {
  start: Vec;
  end: Vec;
  control: Vec;
  mid: Vec;
  rawStart?: Vec;
  rawEnd?: Vec;
}

type Lookup = Map<string, ElementLike>;

export const bindGap = (strokeWidth: number) => 6 + strokeWidth / 2;

function midFromBend(s: Vec, e: Vec, bend: number): Vec {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  return { x: (s.x + e.x) / 2 - dy * bend, y: (s.y + e.y) / 2 + dx * bend };
}

export function bendFromMid(s: Vec, e: Vec, mid: Vec): number {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return 0;
  const mx = mid.x - (s.x + e.x) / 2;
  const my = mid.y - (s.y + e.y) / 2;
  return (-dy * mx + dx * my) / l2;
}

export function controlFromMid(s: Vec, e: Vec, mid: Vec): Vec {
  return { x: 2 * mid.x - (s.x + e.x) / 2, y: 2 * mid.y - (s.y + e.y) / 2 };
}

export function resolveArrow(a: ArrowElementLike, lookup: Lookup | undefined, measure: Measure): ResolvedArrow {
  const startEl = a.startBinding ? lookup?.get(a.startBinding.elementId) : undefined;
  const endEl = a.endBinding ? lookup?.get(a.endBinding.elementId) : undefined;
  const sb = isBindable(startEl) ? startEl : null;
  const eb = isBindable(endEl) ? endEl : null;
  const gap = bindGap(a.strokeWidth);
  const sRaw = sb ? boxCenter(bindableBox(sb, measure)) : a.start;
  const eRaw = eb ? boxCenter(bindableBox(eb, measure)) : a.end;
  const curved = Math.abs(a.bend) > 1e-4;
  const mid = midFromBend(sRaw, eRaw, a.bend);
  const s = sb ? outlinePoint(sb, curved ? mid : eRaw, gap, measure) : sRaw;
  const e = eb ? outlinePoint(eb, curved ? mid : sRaw, gap, measure) : eRaw;
  if (!curved) {
    const m = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
    return { start: s, end: e, mid: m, control: m, rawStart: sRaw, rawEnd: eRaw };
  }
  return { start: s, end: e, mid, control: controlFromMid(s, e, mid), rawStart: sRaw, rawEnd: eRaw };
}

export function curvePoint(r: ResolvedArrow, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * r.start.x + 2 * u * t * r.control.x + t * t * r.end.x,
    y: u * u * r.start.y + 2 * u * t * r.control.y + t * t * r.end.y,
  };
}

export function curveAngleAt(r: ResolvedArrow, t: number): number {
  const dx = 2 * (1 - t) * (r.control.x - r.start.x) + 2 * t * (r.end.x - r.control.x);
  const dy = 2 * (1 - t) * (r.control.y - r.start.y) + 2 * t * (r.end.y - r.control.y);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return Math.atan2(r.end.y - r.start.y, r.end.x - r.start.x);
  return Math.atan2(dy, dx);
}

const SAMPLES = 24;

export function curveSamples(r: ResolvedArrow, n = SAMPLES): Vec[] {
  return Array.from({ length: n + 1 }, (_, i) => curvePoint(r, i / n));
}

function segDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function curveDistance(r: ResolvedArrow, p: Vec): number {
  const pts = curveSamples(r);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDistance(p, pts[i - 1], pts[i]));
  return best;
}

export function curveLength(r: ResolvedArrow): number {
  const pts = curveSamples(r);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export function curveBounds(r: ResolvedArrow) {
  const pts = curveSamples(r);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function subCurve(r: ResolvedArrow, t0: number, t1: number): ResolvedArrow {
  const s = curvePoint(r, t0);
  const e = curvePoint(r, t1);
  const a = (1 - t0) * (1 - t1);
  const b = (1 - t0) * t1 + t0 * (1 - t1);
  const c = t0 * t1;
  const control = {
    x: a * r.start.x + b * r.control.x + c * r.end.x,
    y: a * r.start.y + b * r.control.y + c * r.end.y,
  };
  return { start: s, end: e, control, mid: curvePoint(r, (t0 + t1) / 2) };
}

export const headSize = (strokeWidth: number) => Math.max(14, 10 + strokeWidth * 2.6);

export function headInset(kind: ArrowHead, strokeWidth: number) {
  if (kind === "triangle") return headSize(strokeWidth) * 0.7;
  if (kind === "dot") return headSize(strokeWidth) * 0.3;
  return 0;
}

export type HeadShape =
  | { type: "lines"; points: Vec[] }
  | { type: "polygon"; points: Vec[] }
  | { type: "circle"; center: Vec; radius: number };

export function arrowheadShape(kind: ArrowHead, tip: Vec, angle: number, strokeWidth: number): HeadShape | null {
  if (kind === "none") return null;
  const size = headSize(strokeWidth);
  if (kind === "dot") return { type: "circle", center: tip, radius: size * 0.3 };
  const spread = kind === "arrow" ? 0.5 : 0.42;
  const back = (a: number) => ({ x: tip.x - Math.cos(a) * size, y: tip.y - Math.sin(a) * size });
  const left = back(angle - spread);
  const right = back(angle + spread);
  return kind === "arrow" ? { type: "lines", points: [left, tip, right] } : { type: "polygon", points: [left, tip, right] };
}
