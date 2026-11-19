import { describe, expect, it } from "vitest";
import { cleanLegs, legsOf, legsValid, pointsOf, routeElbow, type Bounds, type RouteEnd } from "@/engine/geometry/elbowRoute";

const box = (x: number, y: number, w: number, h: number): Bounds => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });
const orthogonal = (pts: { x: number; y: number }[]) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
const finite = (pts: { x: number; y: number }[]) => pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
const crosses = (pts: { x: number; y: number }[], b: Bounds) =>
  pts.slice(1).some((p, i) => {
    const q = pts[i];
    return Math.max(p.x, q.x) > b.minX && Math.min(p.x, q.x) < b.maxX && Math.max(p.y, q.y) > b.minY && Math.min(p.y, q.y) < b.maxY;
  });

const A = box(0, 0, 100, 60);
const B = box(300, 200, 120, 80);
const fromA: RouteEnd = { point: { x: 100, y: 30 }, dir: "right", box: A };
const intoBLeft: RouteEnd = { point: { x: 300, y: 240 }, dir: "left", box: B };
const intoBBottom: RouteEnd = { point: { x: 360, y: 280 }, dir: "bottom", box: B };

describe("elbow router", () => {
  it("makes a Z between facing sides with the middle leg halfway", () => {
    const pts = routeElbow(fromA, intoBLeft);
    expect(pts).toEqual([{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 240 }, { x: 300, y: 240 }]);
  });
  it("goes around to reach the bottom side without cutting through", () => {
    const pts = routeElbow(fromA, intoBBottom);
    expect(orthogonal(pts)).toBe(true);
    expect(crosses(pts, A)).toBe(false);
    expect(crosses(pts, B)).toBe(false);
    expect(pts[pts.length - 2]).toEqual({ x: 360, y: 300 });
  });
  it("goes straight when aligned and picks a direction for free ends", () => {
    expect(routeElbow({ point: { x: 0, y: 0 }, dir: null, box: null }, { point: { x: 80, y: 0 }, dir: null, box: null })).toEqual([{ x: 0, y: 0 }, { x: 80, y: 0 }]);
    const free = routeElbow({ point: { x: 0, y: 0 }, dir: null, box: null }, { point: { x: 80, y: 50 }, dir: null, box: null });
    expect(orthogonal(free)).toBe(true);
    expect(free.length).toBeLessThanOrEqual(4);
  });
  it("is stable under small moves", () => {
    const a = routeElbow(fromA, intoBLeft);
    const b = routeElbow(fromA, { ...intoBLeft, point: { x: 300, y: 241 }, box: box(300, 201, 120, 80) });
    expect(b.length).toBe(a.length);
    b.forEach((p, i) => expect(Math.hypot(p.x - a[i].x, p.y - a[i].y)).toBeLessThanOrEqual(1));
  });
  it("never fails on coincident ends or overlapping boxes", () => {
    const same = routeElbow({ point: { x: 5, y: 5 }, dir: null, box: null }, { point: { x: 5, y: 5 }, dir: null, box: null });
    expect(finite(same)).toBe(true);
    const near = routeElbow({ point: { x: 100, y: 30 }, dir: "right", box: A }, { point: { x: 110, y: 40 }, dir: "left", box: box(110, 0, 100, 80) });
    expect(finite(near) && orthogonal(near) && near.length >= 2).toBe(true);
    const inside = routeElbow({ point: { x: 100, y: 30 }, dir: "right", box: A }, { point: { x: 60, y: 20 }, dir: "top", box: box(20, 20, 60, 30) });
    expect(finite(inside) && orthogonal(inside) && inside.length >= 2).toBe(true);
  });
});

describe("stored legs", () => {
  it("round-trips a route and follows a moved end", () => {
    const pts = routeElbow(fromA, intoBLeft);
    const legs = legsOf(pts)!;
    expect(legs).toEqual({ first: "h", at: [200] });
    expect(pointsOf(pts[0], pts[3], legs)).toEqual(pts);
    expect(pointsOf(pts[0], { x: 300, y: 400 }, legs)).toEqual([{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 400 }, { x: 300, y: 400 }]);
    expect(legsOf([{ x: 0, y: 0 }, { x: 9, y: 0 }])).toBeNull();
  });
  it("knows when stored legs no longer fit", () => {
    expect(legsValid(fromA, intoBLeft, { first: "h", at: [200] })).toBe(true);
    expect(legsValid(fromA, intoBLeft, { first: "h", at: [90] })).toBe(false);
    expect(legsValid(fromA, intoBLeft, { first: "h", at: [102] })).toBe(false);
    expect(legsValid(fromA, intoBBottom, { first: "h", at: [200] })).toBe(false);
    expect(legsValid(fromA, intoBLeft, { first: "v", at: [200] })).toBe(false);
    expect(legsValid({ ...fromA, dir: null, box: null }, { ...intoBLeft, dir: null, box: null }, { first: "v", at: [100] })).toBe(true);
  });
  it("rejects garbage", () => {
    expect(cleanLegs(null)).toBeNull();
    expect(cleanLegs({ first: "x", at: [1] })).toBeNull();
    expect(cleanLegs({ first: "h", at: [1, NaN] })).toBeNull();
    expect(cleanLegs({ first: "h", at: Array(40).fill(1) })).toBeNull();
    expect(cleanLegs({ first: "v", at: [3, 4] })).toEqual({ first: "v", at: [3, 4] });
  });
});

import { curveLength, isElbow, resolveArrow } from "@/engine/geometry/arrow";

describe("resolveArrow with an elbow route", () => {
  const measure = () => 0;
  const shape = (id: string, x: number, y: number) => ({ id, kind: "shape", shapeType: "rectangle", x, y, width: 100, height: 60, rotation: 0, strokeWidth: 2 }) as any;
  const lookup = new Map([["a", shape("a", 0, 0)], ["b", shape("b", 300, 200)]]);
  const base = { id: "e", kind: "arrow", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, bend: 0, startHead: "none", endHead: "arrow", strokeColor: "#000", strokeWidth: 4, route: "elbow" } as any;

  it("routes between two attached boxes at right angles", () => {
    const r = resolveArrow({ ...base, startBinding: { elementId: "a" }, endBinding: { elementId: "b" } }, lookup, measure);
    expect(isElbow(r)).toBe(true);
    expect(r.points!.every((p, i, all) => i === 0 || p.x === all[i - 1].x || p.y === all[i - 1].y)).toBe(true);
    expect(r.autoRouted).toBe(true);
    expect(curveLength(r)).toBeGreaterThan(0);
  });
  it("honours a pinned side", () => {
    const r = resolveArrow({ ...base, startBinding: { elementId: "a" }, endBinding: { elementId: "b", anchor: { x: 0.5, y: 1 } } }, lookup, measure);
    const last = r.points![r.points!.length - 1];
    const before = r.points![r.points!.length - 2];
    expect(last.x).toBeCloseTo(350);
    expect(last.y).toBeCloseTo(268);
    expect(before.x).toBeCloseTo(350);
    expect(before.y).toBeGreaterThan(last.y);
  });
  it("uses valid stored legs and ignores garbage or stale ones", () => {
    const ends = { startBinding: { elementId: "a" }, endBinding: { elementId: "b" } };
    const auto = resolveArrow({ ...base, ...ends }, lookup, measure);
    const kept = resolveArrow({ ...base, ...ends, legs: { first: "h", at: [150] } }, lookup, measure);
    expect(kept.autoRouted).toBe(false);
    expect(kept.points![1].x).toBe(150);
    for (const legs of [{ first: "h", at: [NaN] }, { first: "h", at: [50] }, "nope"]) {
      const r = resolveArrow({ ...base, ...ends, legs: legs as any }, lookup, measure);
      expect(r.autoRouted).toBe(true);
      expect(r.points).toEqual(auto.points);
    }
  });
});
