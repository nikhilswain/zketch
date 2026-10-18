import type { ShapeElementLike, StrokeLike } from "../types";
import type { HeadShape, ResolvedArrow } from "../geometry/arrow";
import type { Vec } from "../geometry/outline";
import { brushRegistry } from "./BrushRegistry";
import { renderStroke } from "./renderStroke";
import { seededRandom } from "./seededRandom";

const STEP = 4;

type Line = { points: Vec[]; pressures: number[]; taperStart: number; taperEnd: number };

const shapeCache = new WeakMap<object, { key: string; lines: Line[]; fill: Vec[] }>();
const curveCache = new WeakMap<object, { key: string; line: Line }>();

function rng(seed: number) {
  let n = (Math.abs(Math.floor(seed)) % 2147483647) || 1;
  return () => seededRandom(n++);
}

function bowed(a: Vec, b: Vec, bow: number): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(2, Math.ceil(len / STEP));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const off = bow * Math.sin(Math.PI * t);
    return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
  });
}

function pressureProfile(count: number, r: () => number) {
  const tilt = (r() - 0.5) * 0.08;
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    return 0.47 + 0.08 * Math.sin(Math.PI * t) + tilt * (t - 0.5);
  });
}

function edgeStrokes(corners: Vec[], width: number, seed: number): Line[] {
  const r = rng(seed);
  const n = corners.length;
  const over = 3 + width * 0.8;
  return corners.map((a, i) => {
    const b = corners[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const jitter = () => (r() - 0.5) * 1.6;
    const ea = over * (0.4 + r() * 0.6);
    const eb = over * (0.4 + r() * 0.6);
    const sa = { x: a.x - ux * ea + jitter(), y: a.y - uy * ea + jitter() };
    const sb = { x: b.x + ux * eb + jitter(), y: b.y + uy * eb + jitter() };
    const bow = (r() < 0.5 ? -1 : 1) * Math.min(len * 0.012, 3) * (0.5 + r() * 0.5);
    const points = bowed(sa, sb, bow);
    return { points, pressures: pressureProfile(points.length, r), taperStart: width * 1.2, taperEnd: width * 1.6 };
  });
}

function ellipseStroke(s: ShapeElementLike, width: number): Line {
  const r = rng(s.seed ?? 1);
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const rx = s.width / 2;
  const ry = s.height / 2;
  const start = -Math.PI / 2 - 0.6 + r() * 1.2;
  const sweep = Math.PI * 2 + 0.25 + r() * 0.2;
  const shrink = 0.025 + r() * 0.02;
  const n = Math.max(40, Math.round((Math.PI * (rx + ry)) / STEP));
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = start + sweep * t;
    const k = 1 + shrink * 0.5 - shrink * t;
    return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k };
  });
  return { points, pressures: pressureProfile(points.length, r), taperStart: width * 1.2, taperEnd: width * 2 };
}

function roundedRect(x: number, y: number, w: number, h: number, k: number): Vec[] {
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

function roundedRectStroke(s: ShapeElementLike, k: number, width: number): Line {
  const r = rng(s.seed ?? 1);
  const loop = roundedRect(s.x, s.y, s.width, s.height, k);
  const dense: Vec[] = [];
  for (let i = 0; i < loop.length; i++) {
    dense.push(...bowed(loop[i], loop[(i + 1) % loop.length], 0).slice(0, -1));
  }
  const extra = Math.max(4, Math.round(dense.length * 0.04));
  const drift = 1 + width * 0.25;
  const points = [...dense, ...dense.slice(0, extra).map((p, i) => ({ x: p.x, y: p.y + (drift * (i + 1)) / extra }))];
  return { points, pressures: pressureProfile(points.length, r), taperStart: width * 1.2, taperEnd: width * 2 };
}

function polygonFor(s: ShapeElementLike): Vec[] {
  const { x, y, width: w, height: h } = s;
  if (s.shapeType === "diamond") {
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 },
    ];
  }
  if (s.shapeType === "triangle") {
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function ellipseFill(s: ShapeElementLike): Vec[] {
  const n = 48;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: s.x + s.width / 2 + (Math.cos(a) * s.width) / 2, y: s.y + s.height / 2 + (Math.sin(a) * s.height) / 2 };
  });
}

function strokeOf(line: Line, color: string, width: number): StrokeLike {
  return {
    id: "sketch",
    points: line.points.map((p, i) => ({ x: p.x, y: p.y, pressure: line.pressures[i] ?? 0.5 })),
    color,
    size: width * 1.15,
    opacity: 1,
    brushStyle: "ink",
    timestamp: 0,
    thinning: 0.3,
    smoothing: 0.4,
    streamline: 0,
    taperStart: line.taperStart,
    taperEnd: line.taperEnd,
    input: "pen",
  };
}

function trace(ctx: CanvasRenderingContext2D, points: Vec[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export function drawSketchyShape(ctx: CanvasRenderingContext2D, s: ShapeElementLike) {
  const width = s.strokeWidth;
  const key = `${s.shapeType}|${s.x}|${s.y}|${s.width}|${s.height}|${s.cornerRadius}|${width}|${s.seed}`;
  let hit = shapeCache.get(s);
  if (!hit || hit.key !== key) {
    const k = Math.max(0, Math.min(s.cornerRadius, s.width / 2, s.height / 2));
    let lines: Line[];
    let fill: Vec[];
    if (s.shapeType === "circle") {
      lines = [ellipseStroke(s, width)];
      fill = ellipseFill(s);
    } else if (s.shapeType === "rectangle" && k >= 4) {
      lines = [roundedRectStroke(s, k, width)];
      fill = roundedRect(s.x, s.y, s.width, s.height, k);
    } else {
      const corners = polygonFor(s);
      lines = edgeStrokes(corners, width, s.seed ?? 1);
      fill = corners;
    }
    hit = { key, lines, fill };
    shapeCache.set(s, hit);
  }
  if (s.fillColor) {
    ctx.fillStyle = s.fillColor;
    trace(ctx, hit.fill);
    ctx.fill();
  }
  if (s.strokeColor !== "transparent" && width > 0) {
    for (const line of hit.lines) renderStroke(ctx, strokeOf(line, s.strokeColor, width), brushRegistry);
  }
}

function curvePoints(r: ResolvedArrow, bow: number): Vec[] {
  const straight = Math.hypot(r.control.x - (r.start.x + r.end.x) / 2, r.control.y - (r.start.y + r.end.y) / 2) < 1;
  if (straight) return bowed(r.start, r.end, bow);
  const approx =
    Math.hypot(r.control.x - r.start.x, r.control.y - r.start.y) + Math.hypot(r.end.x - r.control.x, r.end.y - r.control.y);
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
  ends: { startCapped: boolean; endCapped: boolean } = { startCapped: false, endCapped: true },
) {
  const key = `${r.start.x}|${r.start.y}|${r.control.x}|${r.control.y}|${r.end.x}|${r.end.y}|${seed}|${strokeWidth}|${ends.startCapped}|${ends.endCapped}`;
  let hit = curveCache.get(owner);
  if (!hit || hit.key !== key) {
    const rand = rng(seed);
    const len = Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y);
    const bow = (rand() < 0.5 ? -1 : 1) * Math.min(len * 0.01, 2.5) * (0.5 + rand() * 0.5);
    const points = curvePoints(r, bow);
    hit = {
      key,
      line: {
        points,
        pressures: pressureProfile(points.length, rand),
        taperStart: ends.startCapped ? 0 : strokeWidth * 1.2,
        taperEnd: ends.endCapped ? 0 : strokeWidth * 1.6,
      },
    };
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
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    return;
  }
  const [left, tip, right] = head.points;
  for (const arm of [left, right]) {
    const points = bowed(tip, arm, 0);
    const line: Line = { points, pressures: points.map(() => 0.5), taperStart: 0, taperEnd: strokeWidth * 0.5 };
    renderStroke(ctx, strokeOf(line, stroke, strokeWidth), brushRegistry);
  }
}
