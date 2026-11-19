import { describe, expect, it } from "vitest";
import { anchorFor, anchorPoint, anchorSide, pinsAt, worldSide } from "@/engine/geometry/anchor";
import { resolveArrow } from "@/engine/geometry/arrow";

const measure = () => 0;
const rect = (rotation = 0) => ({ id: "r", kind: "shape", shapeType: "rectangle", x: 0, y: 0, width: 200, height: 100, rotation, strokeWidth: 2 }) as any;
const circle = { ...rect(), id: "c", shapeType: "circle" } as any;
const arrow = (endBinding: any) => ({ id: "a", kind: "arrow", start: { x: -300, y: 50 }, end: { x: 0, y: 0 }, bend: 0, startBinding: null, endBinding, startHead: "none", endHead: "arrow", strokeColor: "#000", strokeWidth: 4 }) as any;

describe("pinned ends", () => {
  it("projects a drop point onto the outline", () => {
    const a = anchorFor(rect(), { x: 100, y: 95 }, measure);
    expect(a.x).toBeCloseTo(0.5);
    expect(a.y).toBeCloseTo(1);
    expect(anchorSide(a)).toBe("bottom");
    const p = anchorPoint(rect(), a, 8, measure);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(108);
  });
  it("works on a circle and gives a side", () => {
    const a = anchorFor(circle, { x: 100, y: 10 }, measure);
    expect(anchorSide(a)).toBe("top");
    const p = anchorPoint(circle, a, 0, measure);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });
  it("follows rotation", () => {
    const a = { x: 0.5, y: 1 };
    const p = anchorPoint(rect(90), a, 0, measure);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(50);
    expect(worldSide(90, "bottom")).toBe("left");
    expect(worldSide(0, "bottom")).toBe("bottom");
    expect(worldSide(40, "right")).toBe("right");
  });
  it("pins near an edge, not in the middle", () => {
    expect(pinsAt(rect(), { x: 100, y: 92 }, 1, measure)).toBe(true);
    expect(pinsAt(rect(), { x: 100, y: 50 }, 1, measure)).toBe(false);
    expect(pinsAt(rect(), { x: 100, y: 74 }, 1, measure)).toBe(false);
    expect(pinsAt(rect(), { x: 100, y: 77 }, 1, measure)).toBe(true);
  });
  it("resolveArrow lands a pinned end on its anchor and leaves others alone", () => {
    const lookup = new Map([["r", rect()]]);
    const pinned = resolveArrow(arrow({ elementId: "r", anchor: { x: 0.5, y: 1 } }), lookup, measure);
    expect(pinned.end.x).toBeCloseTo(100);
    expect(pinned.end.y).toBeCloseTo(108);
    const plain = resolveArrow(arrow({ elementId: "r" }), lookup, measure);
    expect(plain.end.x).toBeLessThan(0);
    expect(plain.end.y).toBeCloseTo(50);
  });
});
