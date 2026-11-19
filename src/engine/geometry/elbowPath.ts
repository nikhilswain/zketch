import type { Vec } from "./outline";

export const ELBOW_RADIUS = 12;

const CORNER_STEPS = 8;

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;

export function flattenElbow(points: Vec[], radius: number): Vec[] {
  if (points.length < 2) return points.length ? [points[0], points[0]] : [];
  const pts: Vec[] = [points[0]];
  for (let i = 1; i < points.length; i++) if (!same(points[i], pts[pts.length - 1])) pts.push(points[i]);
  if (pts.length < 2) return [points[0], points[points.length - 1]];
  const out: Vec[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    const b = pts[i + 1];
    const la = Math.hypot(a.x - c.x, a.y - c.y);
    const lb = Math.hypot(b.x - c.x, b.y - c.y);
    const r = Math.min(radius, la / 2, lb / 2);
    if (!(r > 0.01)) {
      out.push(c);
      continue;
    }
    const p1 = { x: c.x + ((a.x - c.x) / la) * r, y: c.y + ((a.y - c.y) / la) * r };
    const p2 = { x: c.x + ((b.x - c.x) / lb) * r, y: c.y + ((b.y - c.y) / lb) * r };
    const center = { x: p1.x + p2.x - c.x, y: p1.y + p2.y - c.y };
    for (let s = 0; s <= CORNER_STEPS; s++) {
      const angle = (s / CORNER_STEPS) * (Math.PI / 2);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      out.push({
        x: center.x + (c.x - p2.x) * ca + (c.x - p1.x) * sa,
        y: center.y + (c.y - p2.y) * ca + (c.y - p1.y) * sa,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function cornerRadius(a: Vec, c: Vec, b: Vec, radius: number): number {
  return Math.max(0, Math.min(radius, Math.hypot(a.x - c.x, a.y - c.y) / 2, Math.hypot(b.x - c.x, b.y - c.y) / 2));
}

export function polyLength(pts: Vec[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

function locate(pts: Vec[], t: number): { index: number; f: number } {
  const total = polyLength(pts);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  if (pts.length < 2 || total <= 0) return { index: 0, f: 0 };
  let left = clamped * total;
  let last = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (seg <= 0) continue;
    last = i - 1;
    if (left <= seg) return { index: i - 1, f: left / seg };
    left -= seg;
  }
  return { index: last, f: 1 };
}

const lerp = (a: Vec, b: Vec, f: number): Vec => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

export function polyPoint(pts: Vec[], t: number): Vec {
  if (!pts.length) return { x: 0, y: 0 };
  if (pts.length < 2) return pts[0];
  const { index, f } = locate(pts, t);
  return lerp(pts[index], pts[index + 1], f);
}

export function polyAngle(pts: Vec[], t: number): number {
  if (pts.length < 2) return 0;
  const { index } = locate(pts, t);
  const a = pts[index];
  const b = pts[index + 1];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function polySlice(pts: Vec[], t0: number, t1: number): Vec[] {
  if (pts.length < 2) return pts.slice();
  const a = locate(pts, Math.min(t0, t1));
  const b = locate(pts, Math.max(t0, t1));
  const out: Vec[] = [lerp(pts[a.index], pts[a.index + 1], a.f)];
  for (let i = a.index + 1; i <= b.index; i++) if (!same(pts[i], out[out.length - 1])) out.push(pts[i]);
  const end = lerp(pts[b.index], pts[b.index + 1], b.f);
  if (!same(end, out[out.length - 1]) || out.length < 2) out.push(end);
  return out;
}
