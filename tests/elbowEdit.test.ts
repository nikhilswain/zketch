import { describe, expect, it } from "vitest";
import { dragLeg, legHandles, mergeLegs } from "@/engine/geometry/elbowEdit";
import { pointsOf } from "@/engine/geometry/elbowRoute";

const Z = [{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 240 }, { x: 300, y: 240 }];

describe("editing elbow legs", () => {
  it("puts a handle on each leg", () => {
    expect(legHandles(Z)).toEqual([
      { index: 0, axis: "h", point: { x: 150, y: 30 } },
      { index: 1, axis: "v", point: { x: 200, y: 135 } },
      { index: 2, axis: "h", point: { x: 250, y: 240 } },
    ]);
  });
  it("moves a middle leg sideways", () => {
    expect(dragLeg(Z, 1, { x: 170, y: 999 })).toEqual({ legs: { first: "h", at: [170] }, index: 1 });
  });
  it("dragging the first leg leaves a stub and adds a bend", () => {
    const out = dragLeg(Z, 0, { x: 150, y: 90 });
    expect(out).toEqual({ legs: { first: "h", at: [120, 90, 200] }, index: 2 });
    expect(pointsOf(Z[0], Z[3], out.legs)).toEqual([
      { x: 100, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 90 }, { x: 200, y: 90 }, { x: 200, y: 240 }, { x: 300, y: 240 },
    ]);
  });
  it("dragging the last leg mirrors it", () => {
    expect(dragLeg(Z, 2, { x: 250, y: 180 })).toEqual({ legs: { first: "h", at: [200, 180, 280] }, index: 2 });
  });
  it("merges legs that line up", () => {
    expect(mergeLegs(Z[0], Z[3], { first: "h", at: [120, 33, 200] }, 6)).toEqual({ first: "h", at: [200] });
    expect(mergeLegs(Z[0], Z[3], { first: "h", at: [120, 90, 200] }, 6)).toEqual({ first: "h", at: [120, 90, 200] });
    expect(mergeLegs({ x: 0, y: 0 }, { x: 100, y: 2 }, { first: "h", at: [50] }, 6)).toBeNull();
  });
});
