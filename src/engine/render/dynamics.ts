import type { Brush, Point, StrokeDefaults, StrokeLike } from "../types";

export const NEUTRAL_STROKE_DEFAULTS: StrokeDefaults = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0,
  taperStart: 0,
  taperEnd: 0,
};

export function strokeDefaultsFor(brush: Brush | undefined): StrokeDefaults {
  return { ...NEUTRAL_STROKE_DEFAULTS, ...(brush?.strokeDefaults ?? {}) };
}

export function stabilize(points: readonly Point[], amount: number): Point[] {
  if (amount <= 0 || points.length < 2) return points.map((p) => ({ ...p }));
  const t = 1 - 0.9 * Math.min(1, amount);
  const out: Point[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1];
    const p = points[i];
    out.push({
      x: prev.x + (p.x - prev.x) * t,
      y: prev.y + (p.y - prev.y) * t,
      pressure: p.pressure,
    });
  }
  return out;
}

export function speedPressure(points: readonly Point[], size: number): number[] {
  const out: number[] = [];
  const scale = Math.max(1, size);
  let p = 0.5;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      p = Math.min(1, p + (1 - Math.min(1, d / scale) - p) * 0.275);
    }
    out.push(p);
  }
  return out;
}

export function hasDynamics(stroke: StrokeLike) {
  return stroke.input != null;
}

export function pressureGain(stroke: StrokeLike) {
  if (!hasDynamics(stroke) || stroke.input !== "pen") return 1;
  return 2 * (stroke.thinning ?? 0.5);
}

export function strokePressures(stroke: StrokeLike): number[] {
  const stored = stroke.points.map((p) => p.pressure ?? 0.5);
  if (!hasDynamics(stroke) || stroke.input === "pen") return stored;
  const amount = 2 * (stroke.thinning ?? 0.5) - 1;
  if (amount === 0) return stored.map(() => 0.5);
  return speedPressure(stroke.points, stroke.size).map(
    (p) => 0.5 + (p - 0.5) * amount,
  );
}

export function dynamicPoints(stroke: StrokeLike): Point[] {
  if (!hasDynamics(stroke)) return stroke.points;
  const pressures = strokePressures(stroke);
  const withPressure = stroke.points.map((p, i) => ({
    x: p.x,
    y: p.y,
    pressure: pressures[i],
  }));
  return stabilize(withPressure, stroke.streamline ?? 0);
}

export function taperFactor(
  distFromStart: number,
  distToEnd: number,
  taperStart: number,
  taperEnd: number,
) {
  const ramp = (d: number, len: number) => {
    if (len <= 0) return 1;
    const t = Math.max(0, Math.min(1, d / len));
    return t * t * (3 - 2 * t);
  };
  return ramp(distFromStart, taperStart) * ramp(distToEnd, taperEnd);
}
