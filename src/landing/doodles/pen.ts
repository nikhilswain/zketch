import type { BrushStyle, StrokeLike } from "@/engine/types";

export interface Pt {
  x: number;
  y: number;
}

export interface PenStyle {
  brush: BrushStyle;
  color: string;
  size: number;
  opacity?: number;
  wobble?: number;
  speed?: number;
  taper?: [number, number];
}

export type StrokeRoleTag = "o" | "f";

export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resample(path: Pt[], step: number): Pt[] {
  if (path.length < 2) return path.slice();
  const out: Pt[] = [path[0]];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = step - carry;
    while (d <= len) {
      const k = d / len;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = path[path.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.3) out.push(last);
  return out;
}

function length(path: Pt[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return n;
}

function pressureAt(t: number): number {
  const up = Math.min(1, t / 0.15);
  const down = Math.min(1, (1 - t) / 0.22);
  const ramp = Math.min(up * up * (3 - 2 * up), down * down * (3 - 2 * down));
  return 0.3 + 0.5 * ramp;
}

export class Pen {
  t = 0;
  private rand: () => number;
  private count = 0;

  constructor(
    seed: number,
    private prefix = "doodle",
  ) {
    this.rand = mulberry(seed);
  }

  random(): number {
    return this.rand();
  }

  rest(ms: number): void {
    this.t += ms;
  }

  stroke(path: Pt[], s: PenStyle, role: StrokeRoleTag = "o"): StrokeLike {
    const r = this.rand;
    const pts = resample(path, 3);
    const wobble = s.wobble ?? 1.2;
    const total = Math.max(1, length(pts));
    const l1 = 30 + r() * 40;
    const l2 = 9 + r() * 8;
    const p1 = r() * Math.PI * 2;
    const p2 = r() * Math.PI * 2;
    const a2 = 0.35 + r() * 0.3;
    let run = 0;
    const points = pts.map((p, i) => {
      if (i > 0) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / dl;
      const ny = (b.x - a.x) / dl;
      const off = wobble * (Math.sin(run / l1 + p1) + a2 * Math.sin(run / l2 + p2));
      return { x: p.x + nx * off, y: p.y + ny * off, pressure: pressureAt(run / total) };
    });
    if (points.length >= 2 && wobble > 0) {
      const over = 1 + r() * 3 * Math.min(1, wobble);
      const e = points[points.length - 1];
      const d = points[points.length - 2];
      const dl = Math.hypot(e.x - d.x, e.y - d.y) || 1;
      points.push({ x: e.x + ((e.x - d.x) / dl) * over, y: e.y + ((e.y - d.y) / dl) * over, pressure: 0.3 });
    }
    const duration = Math.max(120, total / (s.speed ?? 0.6));
    const startTime = this.t;
    this.t += duration + 60 + r() * 100;
    const [ts, te] = s.taper ?? [0, 0];
    return {
      id: `${this.prefix}-${role}${this.count++}`,
      points,
      color: s.color,
      size: s.size,
      opacity: s.opacity ?? 1,
      brushStyle: s.brush,
      timestamp: startTime,
      startTime,
      duration,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.4,
      taperStart: ts,
      taperEnd: te,
      input: "pen",
    };
  }
}

function catmull(pts: Pt[], per = 8): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const shapes = {
  line(a: Pt, b: Pt, bow = 0): Pt[] {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const cx = mx - ((b.y - a.y) / dl) * bow;
    const cy = my + ((b.x - a.x) / dl) * bow;
    const out: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
    }
    return out;
  },
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ry = r): Pt[] {
    const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(r, ry)) / 4));
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * ry });
    }
    return out;
  },
  ellipse(cx: number, cy: number, rx: number, ry: number, overshoot = 0.25, start = -Math.PI / 2): Pt[] {
    return shapes.arc(cx, cy, rx, start, start + Math.PI * 2 + overshoot, ry);
  },
  poly(pts: Pt[], closed = false): Pt[] {
    return closed ? [...pts, pts[0]] : pts.slice();
  },
  curve(pts: Pt[]): Pt[] {
    return catmull(pts);
  },
};

function rotate(p: Pt, c: number, s: number): Pt {
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function scanlines(poly: Pt[], angle: number, gap: number): [Pt, Pt][] {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rp = poly.map((p) => rotate(p, c, s));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rp) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const out: [Pt, Pt][] = [];
  const back = (p: Pt) => rotate(p, Math.cos(angle), Math.sin(angle));
  for (let y = minY + gap / 2; y < maxY; y += gap) {
    const xs: number[] = [];
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i];
      const b = rp[(i + 1) % rp.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (xs.length < 2) continue;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const inset = Math.min(gap * 0.4, (x1 - x0) * 0.2);
    if (x1 - x0 - inset * 2 < 1) continue;
    out.push([back({ x: x0 + inset, y }), back({ x: x1 - inset, y })]);
  }
  return out;
}

export const fill = {
  hatch(poly: Pt[], angle: number, gap: number): Pt[][] {
    return scanlines(poly, angle, gap).map(([a, b]) => [a, b]);
  },
  scrub(poly: Pt[], gap: number, angle = -0.5): Pt[] {
    const lines = scanlines(poly, angle, gap);
    const out: Pt[] = [];
    lines.forEach(([a, b], i) => {
      if (i % 2 === 0) out.push(a, b);
      else out.push(b, a);
    });
    return out;
  },
};
