import { describe, expect, it } from "vitest";
import { flattenElbow, polyLength, polyPoint, polySlice } from "@/engine/geometry/elbowPath";
import { curveAngleAt, curveBounds, curveDistance, curveLength, curvePoint, subCurve } from "@/engine/geometry/arrow";

const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
const elbow = (points: { x: number; y: number }[], radius = 12) => ({
  start: points[0], end: points[points.length - 1], control: points[0], mid: points[0], points, radius,
});

describe("elbow path", () => {
  it("rounds a corner without leaving the corner's box", () => {
    const pts = flattenElbow(L, 12);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 100 });
    expect(pts.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)).toBe(true);
    expect(pts.some((p) => p.x === 100 && p.y === 0)).toBe(false);
    expect(polyLength(pts)).toBeLessThan(200);
    expect(polyLength(pts)).toBeGreaterThan(190);
  });
  it("shrinks the radius on short legs and survives degenerate input", () => {
    const short = flattenElbow([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }], 12);
    expect(short.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x <= 6 && p.y <= 5)).toBe(true);
    expect(flattenElbow([{ x: 3, y: 3 }, { x: 3, y: 3 }], 12)).toHaveLength(2);
    expect(flattenElbow([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }], 12).every((p) => Number.isFinite(p.x))).toBe(true);
  });
  it("measures by fraction of length", () => {
    const pts = flattenElbow(L, 0);
    expect(polyPoint(pts, 0.25)).toEqual({ x: 50, y: 0 });
    expect(polyPoint(pts, 0.75)).toEqual({ x: 100, y: 50 });
    const cut = polySlice(pts, 0.25, 0.75);
    expect(cut[0]).toEqual({ x: 50, y: 0 });
    expect(cut[cut.length - 1]).toEqual({ x: 100, y: 50 });
    expect(polyLength(cut)).toBeCloseTo(100);
  });
  it("arrow helpers follow an elbow", () => {
    const r = elbow(L, 0);
    expect(curveLength(r)).toBeCloseTo(200);
    expect(curvePoint(r, 0.5)).toEqual({ x: 100, y: 0 });
    expect(curveAngleAt(r, 0)).toBeCloseTo(0);
    expect(curveAngleAt(r, 1)).toBeCloseTo(Math.PI / 2);
    expect(curveDistance(r, { x: 50, y: 10 })).toBeCloseTo(10);
    expect(curveBounds(r)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    const body = subCurve(r, 0.1, 0.9);
    expect(body.start).toEqual({ x: 20, y: 0 });
    expect(body.end).toEqual({ x: 100, y: 80 });
    expect(curveLength(body)).toBeCloseTo(160);
  });
  it("leaves a curve untouched", () => {
    const curve = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, control: { x: 50, y: 50 }, mid: { x: 50, y: 25 } };
    expect(curvePoint(curve, 0.5)).toEqual({ x: 50, y: 25 });
  });
});
