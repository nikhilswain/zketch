import type { ShapeElementLike, StrokeLike } from "../types";
import type { HeadShape, ResolvedArrow } from "../geometry/arrow";
import type { Vec } from "../geometry/outline";
import { brushRegistry } from "./BrushRegistry";
import { renderStroke } from "./renderStroke";
import { seededRandom } from "./seededRandom";

const STEP = 5;

type Line = { points: Vec[]; pressures: number[]; closed: boolean };

const shapeCache = new WeakMap<object, { key: string; line: Line }>();
const curveCache = new WeakMap<object, { key: string; line: Line }>();

function rng(seed: number) {
  let n = (seed % 2147483647) || 1;
  return () => seededRandom(n++);
}

function waves(seed: number) {
  const r = rng(seed);
  return [2, 3, 5].map((k) => ({ k, phase: r() * Math.PI * 2, amp: (0.55 + r() * 0.45) / Math.sqrt(k) }));
}

function wave(ws: { k: number; phase: number; amp: number }[], u: number) {
  return ws.reduce((sum, w) => sum + w.amp * Math.sin(Math.PI * 2 * w.k * u + w.phase), 0);
}

function lengthOf(points: Vec[], closed: boolean) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 1) {
    const a = points[points.length - 1];
    len += Math.hypot(points[0].x - a.x, points[0].y - a.y);
  }
  return len;
}

function resample(points: Vec[], closed: boolean): Vec[] {
  const src = closed ? [...points, points[0]] : points;
  const out: Vec[] = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1];
    const b = src[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / STEP));
    for (let j = 1; j <= n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  if (closed) out.pop();
  return out;
}

function wobble(points: Vec[], closed: boolean, seed: number, amplitude: number): Line {
  const pts = resample(points, closed);
  const total = lengthOf(pts, closed) || 1;
  const shape = waves(seed);
  const press = waves(seed + 7);
  const out: Vec[] = [];
  const pressures: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const u = s / total;
    const prev = pts[i === 0 ? (closed ? pts.length - 1 : 0) : i - 1];
    const next = pts[i === pts.length - 1 ? (closed ? 0 : i) : i + 1];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    const envelope = closed ? 1 : Math.sin(Math.PI * u);
    const d = amplitude * envelope * wave(shape, u);
    out.push({ x: pts[i].x - (ty / tl) * d, y: pts[i].y + (tx / tl) * d });
    pressures.push(0.5 + 0.09 * wave(press, u));
  }
  return { points: out, pressures, closed };
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): Vec[] {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (k < 0.5) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const corner = (cx: number, cy: number, from: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = from + (i / 6) * (Math.PI / 2);
      return { x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k };
    });
  return [
    ...corner(x + w - k, y + k, -Math.PI / 2),
    ...corner(x + w - k, y + h - k, 0),
    ...corner(x + k, y + h - k, Math.PI / 2),
    ...corner(x + k, y + k, Math.PI),
  ];
}

function roundedPolygon(corners: Vec[], radius: number): Vec[] {
  const n = corners.length;
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = corners[(i + n - 1) % n];
    const cur = corners[i];
    const next = corners[(i + 1) % n];
    const lp = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const ln = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lp / 3, ln / 3);
    const a = { x: cur.x + ((prev.x - cur.x) / lp) * r, y: cur.y + ((prev.y - cur.y) / lp) * r };
    const b = { x: cur.x + ((next.x - cur.x) / ln) * r, y: cur.y + ((next.y - cur.y) / ln) * r };
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * cur.x + t * t * b.x, y: u * u * a.y + 2 * u * t * cur.y + t * t * b.y });
    }
  }
  const seam = { x: (out[4].x + out[5].x) / 2, y: (out[4].y + out[5].y) / 2 };
  return [seam, ...out.slice(5), ...out.slice(0, 5)];
}

function shapeOutline(s: ShapeElementLike): Vec[] {
  const { x, y, width: w, height: h } = s;
  switch (s.shapeType) {
    case "circle": {
      const n = Math.max(32, Math.round((Math.PI * (w + h)) / 2 / STEP));
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return { x: x + w / 2 + (Math.cos(a) * w) / 2, y: y + h / 2 + (Math.sin(a) * h) / 2 };
      });
    }
    case "diamond":
      return roundedPolygon(
        [
          { x: x + w / 2, y },
          { x: x + w, y: y + h / 2 },
          { x: x + w / 2, y: y + h },
          { x, y: y + h / 2 },
        ],
        Math.max(3, Math.min(s.cornerRadius, 10)),
      );
    case "triangle":
      return roundedPolygon(
        [
          { x: x + w / 2, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        Math.max(3, Math.min(s.cornerRadius, 10)),
      );
    default:
      return roundedRect(x, y, w, h, s.cornerRadius);
  }
}

function strokeOf(line: Line, color: string, width: number): StrokeLike {
  const pts = line.closed ? [...line.points, ...line.points.slice(0, 3)] : line.points;
  const pr = line.closed ? [...line.pressures, ...line.pressures.slice(0, 3)] : line.pressures;
  return {
    id: "sketch",
    points: pts.map((p, i) => ({ x: p.x, y: p.y, pressure: pr[i] })),
    color,
    size: width * 1.2,
    opacity: 1,
    brushStyle: "ink",
    timestamp: 0,
    thinning: 0.35,
    smoothing: 0.3,
    streamline: 0,
    taperStart: 0,
    taperEnd: 0,
    input: "pen",
  };
}

function trace(ctx: CanvasRenderingContext2D, points: Vec[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export function drawSketchyShape(ctx: CanvasRenderingContext2D, s: ShapeElementLike) {
  const key = `${s.shapeType}|${s.x}|${s.y}|${s.width}|${s.height}|${s.cornerRadius}|${s.seed}`;
  let hit = shapeCache.get(s);
  if (!hit || hit.key !== key) {
    const outline = shapeOutline(s);
    const amplitude = Math.max(0.6, Math.min(2.2, lengthOf(outline, true) * 0.0035));
    hit = { key, line: wobble(outline, true, s.seed ?? 1, amplitude) };
    shapeCache.set(s, hit);
  }
  if (s.fillColor) {
    ctx.fillStyle = s.fillColor;
    trace(ctx, hit.line.points);
    ctx.fill();
  }
  if (s.strokeColor !== "transparent" && s.strokeWidth > 0) {
    renderStroke(ctx, strokeOf(hit.line, s.strokeColor, s.strokeWidth), brushRegistry);
  }
}

function curvePoints(r: ResolvedArrow): Vec[] {
  const approx = Math.hypot(r.control.x - r.start.x, r.control.y - r.start.y) + Math.hypot(r.end.x - r.control.x, r.end.y - r.control.y);
  const n = Math.max(2, Math.ceil(approx / STEP));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * r.start.x + 2 * u * t * r.control.x + t * t * r.end.x,
      y: u * u * r.start.y + 2 * u * t * r.control.y + t * t * r.end.y,
    };
  });
}

export function drawSketchyCurve(
  ctx: CanvasRenderingContext2D,
  owner: object,
  r: ResolvedArrow,
  seed: number,
  stroke: string,
  strokeWidth: number,
) {
  const key = `${r.start.x}|${r.start.y}|${r.control.x}|${r.control.y}|${r.end.x}|${r.end.y}|${seed}`;
  let hit = curveCache.get(owner);
  if (!hit || hit.key !== key) {
    const pts = curvePoints(r);
    const amplitude = Math.max(0.5, Math.min(1.6, lengthOf(pts, false) * 0.005));
    hit = { key, line: wobble(pts, false, seed, amplitude) };
    curveCache.set(owner, hit);
  }
  renderStroke(ctx, strokeOf(hit.line, stroke, strokeWidth), brushRegistry);
}

export function drawSketchyHead(ctx: CanvasRenderingContext2D, head: HeadShape, stroke: string, strokeWidth: number) {
  if (head.type === "circle") {
    ctx.beginPath();
    ctx.arc(head.center.x, head.center.y, head.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (head.type === "polygon") {
    trace(ctx, head.points);
    ctx.fill();
  }
  const pts = head.type === "polygon" ? [...head.points, head.points[0]] : head.points;
  const line: Line = { points: resample(pts, false), pressures: [], closed: false };
  line.pressures = line.points.map(() => 0.5);
  renderStroke(ctx, strokeOf(line, stroke, strokeWidth), brushRegistry);
}
