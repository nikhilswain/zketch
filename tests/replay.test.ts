import { describe, expect, it } from "vitest";
import {
  autoSpeed,
  buildReplay,
  nextSpeedMode,
  progressAt,
  speedFor,
} from "../src/share/replay";

const stroke = (id: string, t: number, d = 500, timed = true): any => ({
  id,
  points: [
    { x: 0, y: 0, pressure: 0.5 },
    { x: 1, y: 1, pressure: 0.5 },
  ],
  color: "#000",
  size: 4,
  brushStyle: "pen",
  timestamp: t,
  startTime: timed ? t : null,
  duration: d,
});

const shape = (id: string, createdAt?: number): any => ({
  id,
  shapeType: "rect",
  createdAt,
});

const draw = (id: string, elements: any[], visible = true): any => ({
  type: "draw",
  id,
  name: id,
  elements,
  visible,
  locked: false,
  opacity: 1,
});

describe("buildReplay", () => {
  it("interleaves strokes from two layers by time", () => {
    const r = buildReplay([
      draw("A", [stroke("a0", 0), stroke("a1", 2000)]),
      draw("B", [stroke("b0", 1000)]),
    ]);
    expect(r.items.map((i) => [i.layer, i.element])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(r.items.map((i) => i.start)).toEqual([0, 1000, 2000]);
  });

  it("compresses long gaps", () => {
    const r = buildReplay([draw("A", [stroke("a", 0), stroke("b", 60000)])]);
    expect(r.items[1].start).toBe(1000);
    expect(r.total).toBe(1500);
  });

  it("untimed shapes follow the element before them", () => {
    const r = buildReplay([
      draw("A", [stroke("a", 0), shape("s1"), shape("s2")]),
    ]);
    expect(r.items.map((i) => [i.start, i.end])).toEqual([
      [0, 500],
      [500, 800],
      [800, 1100],
    ]);
  });

  it("pure diagram still has a replay", () => {
    const r = buildReplay([
      draw("A", [shape("1"), shape("2"), shape("3")]),
    ]);
    expect(r.total).toBe(900);
  });

  it("timed shapes use createdAt", () => {
    const r = buildReplay([
      draw("A", [shape("s", 0), stroke("a", 300)]),
    ]);
    const s = r.items.find((i) => i.element === 0)!;
    const k = r.items.find((i) => i.element === 1)!;
    expect([s.start, s.end]).toEqual([0, 300]);
    expect(k.start).toBe(300);
  });

  it("strokes without startTime use timestamp", () => {
    const r = buildReplay([
      draw("A", [stroke("a", 1000, 500, false), stroke("b", 2000, 500, false)]),
    ]);
    expect(r.items.map((i) => i.start)).toEqual([0, 1000]);
  });

  it("empty and image-only drawings have zero length", () => {
    const image: any = {
      type: "image",
      id: "i",
      name: "i",
      blobId: "b",
      visible: true,
      locked: false,
      opacity: 1,
    };
    for (const r of [buildReplay([image]), buildReplay([])]) {
      expect(r.total).toBe(0);
      expect(r.items).toEqual([]);
      expect(progressAt(r, 0).size).toBe(0);
    }
  });

  it("hidden layers are skipped", () => {
    const r = buildReplay([draw("A", [stroke("a", 0)], false)]);
    expect(r.items).toEqual([]);
  });

  it("progressAt gives partial progress", () => {
    const r = buildReplay([draw("A", [stroke("a", 0)])]);
    expect(progressAt(r, 250).get("0:0")).toBe(0.5);
    expect(progressAt(r, 600).get("0:0")).toBe(1);
    expect(progressAt(r, -1).size).toBe(0);
  });
});

describe("speed", () => {
  it("auto speed fits about 15 seconds", () => {
    expect(autoSpeed(5000)).toBe(1);
    expect(autoSpeed(180000)).toBe(12);
    expect(speedFor("fast", 180000)).toBe(24);
    expect(speedFor("real", 180000)).toBe(1);
    expect(nextSpeedMode("auto")).toBe("real");
    expect(nextSpeedMode("real")).toBe("fast");
    expect(nextSpeedMode("fast")).toBe("auto");
  });
});
