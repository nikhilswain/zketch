import { beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  brushRegistry,
  registerDefaultBrushes,
} from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { StampBrush } from "@/engine/stamp/StampBrush";
import type { StrokeLike } from "@/engine/types";

const W = 240;
const H = 140;

function stroke(overrides: Partial<StrokeLike> = {}): StrokeLike {
  const points: StrokeLike["points"] = [];
  for (let i = 0; i <= 60; i++) {
    points.push({ x: 20 + i * 3.3, y: 70 + Math.sin(i / 8) * 35, pressure: 0.7 });
  }
  return {
    id: "s1",
    points,
    color: "#202020",
    size: 14,
    opacity: 1,
    brushStyle: "pencil",
    timestamp: 0,
    ...overrides,
  } as StrokeLike;
}

function pixels(s: StrokeLike, brush?: StampBrush) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  if (brush) brush.render(ctx as never, s);
  else renderStroke(ctx as never, s, brushRegistry);
  return ctx.getImageData(0, 0, W, H).data;
}

function stats(d: Uint8ClampedArray) {
  let covered = 0;
  let sum = 0;
  let max = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) covered++;
    sum += d[i];
    if (d[i] > max) max = d[i];
  }
  return { covered, mean: sum / (d.length / 4), max };
}

const flat = new StampBrush({
  key: "flat-test",
  label: "Flat",
  tips: ["round-hard"],
  spacing: 0.1,
  flow: 0.6,
});

beforeAll(() => {
  registerDefaultBrushes();
});

describe("StampBrush", () => {
  it("renders the pencil with visible pixels", () => {
    expect(stats(pixels(stroke())).covered).toBeGreaterThan(500);
  });

  it("is deterministic for the same stroke id", () => {
    const a = Buffer.from(pixels(stroke()));
    const b = Buffer.from(pixels(stroke()));
    expect(a.equals(b)).toBe(true);
  });

  it("jitter depends on the stroke id", () => {
    const a = Buffer.from(pixels(stroke({ id: "a" })));
    const b = Buffer.from(pixels(stroke({ id: "b" })));
    expect(a.equals(b)).toBe(false);
  });

  it("caps a self-overlapping stroke at its opacity", () => {
    const loop = stroke({ opacity: 0.4 });
    loop.points = [...loop.points, ...[...loop.points].reverse()];
    const { max } = stats(pixels(loop, flat));
    expect(max).toBeLessThanOrEqual(Math.round(255 * 0.4) + 1);
    expect(max).toBeGreaterThan(Math.round(255 * 0.4) - 8);
  });

  it("grain breaks up coverage compared with the same stamp without grain", () => {
    const grained = new StampBrush({
      ...flat.spec,
      key: "grain-test",
      grain: { id: "paper-noise", scale: 0.5, depth: 1 },
    });
    const without = stats(pixels(stroke(), flat));
    const withGrain = stats(pixels(stroke(), grained));
    expect(withGrain.mean).toBeLessThan(without.mean * 0.85);
  });

  it("incremental live rendering matches the full render", () => {
    const brush = brushRegistry.get("pencil") as StampBrush;
    const full = stroke({ id: "live-1" });
    const liveCanvas = createCanvas(W, H);
    const liveCtx = liveCanvas.getContext("2d");
    for (let n = 1; n <= full.points.length; n += 3) {
      liveCtx.clearRect(0, 0, W, H);
      brush.render(liveCtx as never, {
        ...full,
        live: true,
        points: full.points.slice(0, n),
      });
    }
    liveCtx.clearRect(0, 0, W, H);
    brush.render(liveCtx as never, { ...full, live: true });
    const a = Buffer.from(liveCtx.getImageData(0, 0, W, H).data);
    const b = Buffer.from(pixels(full));
    expect(a.equals(b)).toBe(true);
  });

  it("committing after a live preview matches a fresh full render on an offset canvas", () => {
    const brush = brushRegistry.get("pencil") as StampBrush;
    const s = stroke({ id: "live-2" });
    const display = createCanvas(W, H).getContext("2d");
    for (let n = 2; n <= s.points.length; n += 5) {
      display.clearRect(0, 0, W, H);
      brush.render(display as never, { ...s, live: true, points: s.points.slice(0, n) });
    }
    const layerA = createCanvas(W + 40, H + 40).getContext("2d");
    layerA.setTransform(1, 0, 0, 1, 20, 20);
    brush.render(layerA as never, s);
    const layerB = createCanvas(W + 40, H + 40).getContext("2d");
    layerB.setTransform(1, 0, 0, 1, 20, 20);
    brush.render(layerB as never, s);
    const a = layerA.getImageData(0, 0, W + 40, H + 40).data;
    const b = layerB.getImageData(0, 0, W + 40, H + 40).data;
    let maxDiff = 0;
    for (let i = 3; i < a.length; i += 4) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    expect(stats(a).covered).toBeGreaterThan(500);
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  it("respects the ctx transform", () => {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    flat.render(ctx as never, stroke());
    const d = ctx.getImageData(0, 0, W, H).data;
    let rightHalf = 0;
    for (let y = 0; y < H; y++) {
      for (let x = W / 2 + 10; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) rightHalf++;
    }
    expect(stats(d).covered).toBeGreaterThan(100);
    expect(rightHalf).toBe(0);
  });
});
