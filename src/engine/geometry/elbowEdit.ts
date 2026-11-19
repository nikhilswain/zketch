import type { ArrowLegs } from "../types";
import type { Axis } from "./anchor";
import { ELBOW_MARGIN } from "./elbowRoute";
import type { Vec } from "./outline";

export interface LegHandle {
  index: number;
  axis: Axis;
  point: Vec;
}

const axisOf = (a: Vec, b: Vec): Axis => (a.y === b.y && a.x !== b.x ? "h" : "v");
const flip = (axis: Axis): Axis => (axis === "h" ? "v" : "h");

export function legHandles(points: Vec[]): LegHandle[] {
  const out: LegHandle[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < 2) continue;
    out.push({ index: i, axis: axisOf(a, b), point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  return out;
}

export function dragLeg(points: Vec[], index: number, to: Vec, margin = ELBOW_MARGIN): { legs: ArrowLegs; index: number } {
  const n = points.length - 1;
  const first = axisOf(points[0], points[1]);
  const axisAt = (k: number): Axis => (k % 2 === 0 ? first : flip(first));
  const at: number[] = [];
  for (let k = 1; k < n - 1; k++) at.push(axisAt(k) === "h" ? points[k].y : points[k].x);
  const start = points[0];
  const end = points[n];
  const drag = axisAt(index) === "h" ? to.y : to.x;
  const stubFrom = (from: Vec, toward: Vec, axis: Axis) =>
    axis === "h" ? from.x + (Math.sign(toward.x - from.x) || 1) * margin : from.y + (Math.sign(toward.y - from.y) || 1) * margin;

  if (n === 1) {
    return { legs: { first, at: [stubFrom(start, end, first), drag, stubFrom(end, start, first)] }, index: 2 };
  }
  if (index <= 0) {
    return { legs: { first, at: [stubFrom(start, points[1], first), drag, ...at] }, index: 2 };
  }
  if (index >= n - 1) {
    return { legs: { first, at: [...at, drag, stubFrom(end, points[n - 1], axisAt(n - 1))] }, index: n - 1 };
  }
  const next = at.slice();
  next[index - 1] = drag;
  return { legs: { first, at: next }, index };
}

export function mergeLegs(start: Vec, end: Vec, legs: ArrowLegs, snap: number): ArrowLegs | null {
  const at = legs.at.slice();
  const axisAt = (k: number): Axis => (k % 2 === 0 ? legs.first : flip(legs.first));
  for (let guard = 0; guard < 64; guard++) {
    const n = at.length + 2;
    const coord = (k: number) => {
      if (k === 0) return axisAt(0) === "h" ? start.y : start.x;
      if (k === n - 1) return axisAt(k) === "h" ? end.y : end.x;
      return at[k - 1];
    };
    let merged = false;
    for (let k = 0; k + 2 < n; k++) {
      if (Math.abs(coord(k) - coord(k + 2)) > snap) continue;
      if (k === 0 && k + 2 === n - 1) return null;
      if (k + 2 === n - 1) at.splice(k - 1, 2);
      else at.splice(k, 2);
      merged = true;
      break;
    }
    if (!merged) break;
  }
  return at.length + 2 < 3 ? null : { first: legs.first, at };
}
