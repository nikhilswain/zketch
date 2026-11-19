import type { ArrowLegs } from "../types";
import { SIDE_VECTORS, sideAxis, type Axis, type Side } from "./anchor";
import type { Vec } from "./outline";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RouteEnd {
  point: Vec;
  dir: Side | null;
  box: Bounds | null;
}

export const ELBOW_MARGIN = 20;
export const MAX_LEGS = 32;
const MIN_MARGIN = 4;

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
const grow = (b: Bounds, by: number): Bounds => ({ minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by });
const extent = (end: RouteEnd): Bounds =>
  end.box ?? { minX: end.point.x, minY: end.point.y, maxX: end.point.x, maxY: end.point.y };

function dedupe(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) if (!out.length || !same(p, out[out.length - 1])) out.push(p);
  return out;
}

function reverses(points: Vec[]): boolean {
  for (let i = 2; i < points.length; i++) {
    const ax = Math.sign(points[i - 1].x - points[i - 2].x);
    const ay = Math.sign(points[i - 1].y - points[i - 2].y);
    const bx = Math.sign(points[i].x - points[i - 1].x);
    const by = Math.sign(points[i].y - points[i - 1].y);
    if (ax === -bx && ay === -by) return true;
  }
  return false;
}

function simplify(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    const n = out.length;
    if (n >= 2) {
      const a = out[n - 2];
      const b = out[n - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[n - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function segmentCrosses(p: Vec, q: Vec, b: Bounds): boolean {
  return (
    Math.max(p.x, q.x) > b.minX && Math.min(p.x, q.x) < b.maxX && Math.max(p.y, q.y) > b.minY && Math.min(p.y, q.y) < b.maxY
  );
}

function pathLength(points: Vec[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  return len;
}

function between(a: Bounds, b: Bounds, axis: "x" | "y"): number | null {
  const [aMin, aMax, bMin, bMax] = axis === "x" ? [a.minX, a.maxX, b.minX, b.maxX] : [a.minY, a.maxY, b.minY, b.maxY];
  if (aMax < bMin) return (aMax + bMin) / 2;
  if (bMax < aMin) return (bMax + aMin) / 2;
  return null;
}

function fitMargin(start: RouteEnd, end: RouteEnd, margin: number): number {
  const ahead = (from: RouteEnd, to: RouteEnd) => {
    const v = SIDE_VECTORS[from.dir as Side];
    return (to.point.x - from.point.x) * v.x + (to.point.y - from.point.y) * v.y;
  };
  if (start.dir && end.dir) {
    const a = SIDE_VECTORS[start.dir];
    const b = SIDE_VECTORS[end.dir];
    if (a.x !== -b.x || a.y !== -b.y) return margin;
    const gap = ahead(start, end);
    return gap > 0 && gap < margin * 2 ? Math.max(gap / 2, 1) : margin;
  }
  const from = start.dir ? start : end.dir ? end : null;
  if (!from) return margin;
  const gap = ahead(from, from === start ? end : start);
  return gap > 0 && gap < margin ? Math.max(gap, 1) : margin;
}

export function routeElbow(start: RouteEnd, end: RouteEnd, wanted = ELBOW_MARGIN): Vec[] {
  const S = start.point;
  const E = end.point;
  if (same(S, E)) return [S, E];
  const margin = fitMargin(start, end, wanted);
  const stub = (e: RouteEnd): Vec =>
    e.dir ? { x: e.point.x + SIDE_VECTORS[e.dir].x * margin, y: e.point.y + SIDE_VECTORS[e.dir].y * margin } : e.point;
  const A = stub(start);
  const B = stub(end);
  const sBox = start.box ? grow(start.box, margin - 1) : null;
  const eBox = end.box ? grow(end.box, margin - 1) : null;
  const sOut = start.box ? grow(start.box, margin) : null;
  const eOut = end.box ? grow(end.box, margin) : null;

  const midX = between(extent(start), extent(end), "x");
  const midY = between(extent(start), extent(end), "y");
  const xs = [sOut?.minX, sOut?.maxX, eOut?.minX, eOut?.maxX].filter((v): v is number => v !== undefined);
  const ys = [sOut?.minY, sOut?.maxY, eOut?.minY, eOut?.maxY].filter((v): v is number => v !== undefined);
  const allX = [...xs, A.x, B.x];
  const allY = [...ys, A.y, B.y];
  const outerX = [Math.min(...allX) - (xs.length ? 0 : margin), Math.max(...allX) + (xs.length ? 0 : margin)];
  const outerY = [Math.min(...allY) - (ys.length ? 0 : margin), Math.max(...allY) + (ys.length ? 0 : margin)];
  const candX = [...new Set([...(midX === null ? [] : [midX]), ...xs, ...outerX])];
  const candY = [...new Set([...(midY === null ? [] : [midY]), ...ys, ...outerY])];

  const middles: Vec[][] = [];
  if (midX !== null) middles.push([{ x: midX, y: A.y }, { x: midX, y: B.y }]);
  if (midY !== null) middles.push([{ x: A.x, y: midY }, { x: B.x, y: midY }]);
  middles.push([]);
  middles.push([{ x: B.x, y: A.y }]);
  middles.push([{ x: A.x, y: B.y }]);
  for (const x of candX) middles.push([{ x, y: A.y }, { x, y: B.y }]);
  for (const y of candY) middles.push([{ x: A.x, y }, { x: B.x, y }]);
  for (const x of candX)
    for (const y of candY) {
      middles.push([{ x, y: A.y }, { x, y }, { x: B.x, y }]);
      middles.push([{ x: A.x, y }, { x, y }, { x, y: B.y }]);
    }

  let best: Vec[] | null = null;
  let bestScore = Infinity;
  let loose: Vec[] | null = null;
  let looseScore = Infinity;
  for (const middle of middles) {
    const raw = dedupe([S, A, ...middle, B, E]);
    if (raw.some((p, i) => i > 0 && p.x !== raw[i - 1].x && p.y !== raw[i - 1].y)) continue;
    if (reverses(raw)) continue;
    const path = simplify(raw);
    const score = (path.length - 2) * 1e7 + pathLength(path);
    if (score < looseScore) {
      loose = path;
      looseScore = score;
    }
    let blocked = false;
    for (let i = 1; i < raw.length && !blocked; i++) {
      const p = raw[i - 1];
      const q = raw[i];
      if (sBox && !(i === 1 && start.dir) && segmentCrosses(p, q, sBox)) blocked = true;
      if (eBox && !(i === raw.length - 1 && end.dir) && segmentCrosses(p, q, eBox)) blocked = true;
    }
    if (blocked) continue;
    if (score < bestScore) {
      best = path;
      bestScore = score;
    }
  }
  if (best) return best;
  if (margin > MIN_MARGIN) return routeElbow(start, end, Math.max(MIN_MARGIN, margin / 2));
  return loose ?? simplify(dedupe([S, { x: E.x, y: S.y }, E]));
}

const flip = (axis: Axis): Axis => (axis === "h" ? "v" : "h");
const legAxis = (legs: ArrowLegs, index: number): Axis => (index % 2 === 0 ? legs.first : flip(legs.first));

export function legsOf(points: Vec[]): ArrowLegs | null {
  if (points.length < 3) return null;
  const axisOf = (i: number): Axis => (points[i].y === points[i + 1].y && points[i].x !== points[i + 1].x ? "h" : "v");
  const first = axisOf(0);
  const at: number[] = [];
  for (let i = 1; i < points.length - 2; i++) {
    const axis = i % 2 === 0 ? first : flip(first);
    at.push(axis === "h" ? points[i].y : points[i].x);
  }
  return { first, at };
}

export function pointsOf(start: Vec, end: Vec, legs: ArrowLegs): Vec[] {
  const n = legs.at.length + 2;
  const coord = (k: number) => {
    const axis = legAxis(legs, k);
    if (k === 0) return axis === "h" ? start.y : start.x;
    if (k === n - 1) return axis === "h" ? end.y : end.x;
    return legs.at[k - 1];
  };
  const out: Vec[] = [start];
  for (let k = 0; k < n - 1; k++) {
    out.push(legAxis(legs, k) === "h" ? { x: coord(k + 1), y: coord(k) } : { x: coord(k), y: coord(k + 1) });
  }
  out.push(end);
  return out;
}

export function legsValid(start: RouteEnd, end: RouteEnd, legs: ArrowLegs, min = 4): boolean {
  const n = legs.at.length + 2;
  if (start.dir && sideAxis(start.dir) !== legs.first) return false;
  if (end.dir && sideAxis(end.dir) !== legAxis(legs, n - 1)) return false;
  const pts = pointsOf(start.point, end.point, legs);
  if (start.dir) {
    const v = SIDE_VECTORS[start.dir];
    if ((pts[1].x - pts[0].x) * v.x + (pts[1].y - pts[0].y) * v.y < min) return false;
  }
  if (end.dir) {
    const v = SIDE_VECTORS[end.dir];
    const before = pts[pts.length - 2];
    const last = pts[pts.length - 1];
    if ((before.x - last.x) * v.x + (before.y - last.y) * v.y < min) return false;
  }
  for (let i = 1; i < pts.length; i++) {
    if (start.box && i > 1 && segmentCrosses(pts[i - 1], pts[i], start.box)) return false;
    if (end.box && i < pts.length - 1 && segmentCrosses(pts[i - 1], pts[i], end.box)) return false;
  }
  return true;
}

export function shiftLegs(legs: ArrowLegs, dx: number, dy: number): ArrowLegs {
  return { first: legs.first, at: legs.at.map((v, i) => v + (legAxis(legs, i + 1) === "h" ? dy : dx)) };
}

export function scaleLegs(legs: ArrowLegs, origin: Vec, sx: number, sy: number): ArrowLegs {
  return {
    first: legs.first,
    at: legs.at.map((v, i) => (legAxis(legs, i + 1) === "h" ? origin.y + (v - origin.y) * sy : origin.x + (v - origin.x) * sx)),
  };
}

export function cleanLegs(value: unknown): ArrowLegs | null {
  const v = value as ArrowLegs | null | undefined;
  if (!v || typeof v !== "object") return null;
  if (v.first !== "h" && v.first !== "v") return null;
  if (!Array.isArray(v.at) || v.at.length > MAX_LEGS) return null;
  if (!v.at.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { first: v.first, at: v.at.slice() };
}
