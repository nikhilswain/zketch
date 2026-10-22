import { describe, expect, it } from "vitest";
import { buildReplay } from "../src/share/replay";
import { EMPTY_SLICE, NEUTRAL_SLICE, stripLayout, timeSlices } from "../src/share/timeStrip";

const stroke = (t: number, color: string, d = 500): any => ({
  id: `s${t}-${color}`,
  points: [
    { x: 0, y: 0, pressure: 0.5 },
    { x: 1, y: 1, pressure: 0.5 },
  ],
  color,
  size: 4,
  brushStyle: "pen",
  timestamp: t,
  startTime: t,
  duration: d,
});

const draw = (elements: any[]): any => ({
  type: "draw",
  id: "L",
  name: "L",
  elements,
  visible: true,
  locked: false,
  opacity: 1,
});

describe("timeSlices", () => {
  it("empty replay has no slices", () => {
    const layers = [draw([])];
    expect(timeSlices(buildReplay(layers), layers)).toEqual([]);
  });

  it("gives few items one slice each", () => {
    const layers = [draw([stroke(0, "#ff0000"), stroke(500, "#00ff00"), stroke(1000, "#0000ff")])];
    const slices = timeSlices(buildReplay(layers), layers);
    expect(slices).toEqual([
      { start: 0, end: 500, color: "#ff0000" },
      { start: 500, end: 1000, color: "#00ff00" },
      { start: 1000, end: 1500, color: "#0000ff" },
    ]);
  });

  it("caps many items at the maximum", () => {
    const layers = [draw(Array.from({ length: 300 }, (_, i) => stroke(i * 100, "#123456", 100)))];
    const replay = buildReplay(layers);
    const slices = timeSlices(replay, layers);
    expect(slices).toHaveLength(72);
    expect(slices[0].start).toBe(0);
    expect(slices[71].end).toBe(replay.total);
    expect(timeSlices(replay, layers, 10)).toHaveLength(10);
  });

  it("the dominant colour wins a slice", () => {
    const layers = [draw([stroke(0, "#ff0000", 900), stroke(900, "#0000ff", 100), stroke(1000, "#00ff00", 1000)])];
    const slices = timeSlices(buildReplay(layers), layers, 2);
    expect(slices.map((s) => s.color)).toEqual(["#ff0000", "#00ff00"]);
  });

  it("uses shape stroke colour, text colour and a neutral fallback", () => {
    const layers = [
      draw([
        { id: "a", shapeType: "rect", strokeColor: "#aa0000", createdAt: 0 },
        { id: "b", kind: "text", color: "#00aa00", createdAt: 300 },
        { id: "c", shapeType: "rect", strokeColor: "transparent", createdAt: 600 },
      ]),
    ];
    expect(timeSlices(buildReplay(layers), layers).map((s) => s.color)).toEqual([
      "#aa0000",
      "#00aa00",
      NEUTRAL_SLICE,
    ]);
  });

  it("marks slices with nothing in them as empty", () => {
    const layers = [
      draw([0, 100, 200, 300, 60000, 60100, 60200, 60300].map((t) => stroke(t, "#ff0000", 100))),
    ];
    const replay = buildReplay(layers);
    expect(replay.total).toBe(1300);
    const slices = timeSlices(replay, layers, 7);
    expect(slices).toHaveLength(7);
    expect(slices[3].color).toBe(EMPTY_SLICE);
    expect(slices[0].color).toBe("#ff0000");
  });
});

describe("stripLayout", () => {
  it("fills the width and keeps short slices visible", () => {
    const slices = [
      { start: 0, end: 990, color: "#000" },
      { start: 990, end: 1000, color: "#000" },
    ];
    const boxes = stripLayout(slices, 200, 2);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toBe(0);
    expect(boxes[1].x + boxes[1].w).toBeCloseTo(200);
    expect(boxes[1].w).toBeGreaterThanOrEqual(2);
  });
});
