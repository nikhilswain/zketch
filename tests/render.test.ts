import { beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  brushRegistry,
  registerDefaultBrushes,
} from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { renderShape } from "@/engine/render/renderShape";
import { seededRandom } from "@/engine/render/seededRandom";
import type { ShapeElementLike, StrokeLike } from "@/engine/types";

const W = 200;
const H = 120;

function makeStroke(overrides: Partial<StrokeLike> = {}): StrokeLike {
  const points: StrokeLike["points"] = [];
  for (let i = 0; i < 20; i++) {
    points.push({ x: 30 + i * 5, y: 60 + Math.sin(i / 3) * 20, pressure: 0.6 });
  }
  return {
    id: "t",
    points,
    color: "#000000",
    size: 16,
    opacity: 1,
    brushStyle: "ink",
    timestamp: 0,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    taperStart: 0,
    taperEnd: 0,
    easing: "linear",
    ...overrides,
  } as StrokeLike;
}

function newCtx() {
  const canvas = createCanvas(W, H);
  return { canvas, ctx: canvas.getContext("2d") };
}

function renderStrokePixels(stroke: StrokeLike) {
  const { ctx } = newCtx();
  renderStroke(ctx as never, stroke, brushRegistry);
  return ctx.getImageData(0, 0, W, H).data;
}

function alphaCount(data: Uint8ClampedArray) {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

function meanAlpha(data: Uint8ClampedArray) {
  let sum = 0;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) {
    sum += data[i];
    n++;
  }
  return sum / n;
}

const shapeBase: ShapeElementLike = {
  id: "s",
  shapeType: "rectangle",
  x: 40,
  y: 30,
  width: 80,
  height: 50,
  rotation: 0,
  strokeColor: "#ff0000",
  strokeWidth: 6,
  cornerRadius: 0,
  fillColor: null,
  opacity: 1,
};

beforeAll(() => {
  registerDefaultBrushes();
});

describe("brushes", () => {
  it("registers ink, spray and texture", () => {
    expect(brushRegistry.has("ink")).toBe(true);
    expect(brushRegistry.has("spray")).toBe(true);
    expect(brushRegistry.has("texture")).toBe(true);
  });

  it("spray renders deterministically (identical pixels across renders)", () => {
    const a = Buffer.from(renderStrokePixels(makeStroke({ brushStyle: "spray" })));
    const b = Buffer.from(renderStrokePixels(makeStroke({ brushStyle: "spray" })));
    expect(a.equals(b)).toBe(true);
  });

  it("ink, spray and texture all produce visible pixels", () => {
    for (const brushStyle of ["ink", "spray", "texture"] as const) {
      expect(alphaCount(renderStrokePixels(makeStroke({ brushStyle })))).toBeGreaterThan(0);
    }
  });

  it("eraser punches through prior strokes via destination-out and restores composite", () => {
    const { ctx } = newCtx();
    renderStroke(ctx as never, makeStroke({ brushStyle: "ink" }), brushRegistry);
    const before = alphaCount(ctx.getImageData(0, 0, W, H).data);
    renderStroke(ctx as never, makeStroke({ brushStyle: "eraser", size: 60 }), brushRegistry);
    const after = alphaCount(ctx.getImageData(0, 0, W, H).data);
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("respects per-stroke opacity", () => {
    const full = meanAlpha(renderStrokePixels(makeStroke({ opacity: 1 })));
    const faint = meanAlpha(renderStrokePixels(makeStroke({ opacity: 0.25 })));
    expect(full).toBeGreaterThan(0);
    expect(faint).toBeGreaterThan(0);
    expect(faint).toBeLessThan(full);
  });
});

describe("shapes", () => {
  it("renders every shape kind", () => {
    for (const shapeType of ["rectangle", "circle", "diamond", "triangle"] as const) {
      const { ctx } = newCtx();
      renderShape(ctx as never, { ...shapeBase, shapeType });
      expect(alphaCount(ctx.getImageData(0, 0, W, H).data)).toBeGreaterThan(0);
    }
  });

  it("applies element opacity", () => {
    const full = newCtx();
    renderShape(full.ctx as never, shapeBase);
    const faint = newCtx();
    renderShape(faint.ctx as never, { ...shapeBase, opacity: 0.25 });
    const fullA = meanAlpha(full.ctx.getImageData(0, 0, W, H).data);
    const faintA = meanAlpha(faint.ctx.getImageData(0, 0, W, H).data);
    expect(fullA).toBeGreaterThan(0);
    expect(faintA).toBeGreaterThan(0);
    expect(faintA).toBeLessThan(fullA);
  });
});

describe("new brushes", () => {
  it("marker, highlighter, airbrush and calligraphy produce pixels", () => {
    for (const brushStyle of [
      "marker",
      "highlighter",
      "airbrush",
      "calligraphy",
    ] as const) {
      expect(
        alphaCount(renderStrokePixels(makeStroke({ brushStyle }))),
      ).toBeGreaterThan(0);
    }
  });

  it("airbrush is deterministic", () => {
    const a = Buffer.from(
      renderStrokePixels(makeStroke({ brushStyle: "airbrush" })),
    );
    const b = Buffer.from(
      renderStrokePixels(makeStroke({ brushStyle: "airbrush" })),
    );
    expect(a.equals(b)).toBe(true);
  });

  it("marker and highlighter restore the composite operation", () => {
    for (const brushStyle of ["marker", "highlighter"] as const) {
      const { ctx } = newCtx();
      renderStroke(ctx as never, makeStroke({ brushStyle }), brushRegistry);
      expect(ctx.globalCompositeOperation).toBe("source-over");
    }
  });

  it("calligraphy nib angle changes the mark", () => {
    const a = Buffer.from(
      renderStrokePixels(makeStroke({ brushStyle: "calligraphy", angle: 0 })),
    );
    const b = Buffer.from(
      renderStrokePixels(makeStroke({ brushStyle: "calligraphy", angle: 90 })),
    );
    expect(a.equals(b)).toBe(false);
  });
});

describe("seededRandom", () => {
  it("is deterministic and stays in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const seed = i * 12.3 + 0.7;
      const v = seededRandom(seed);
      expect(v).toBe(seededRandom(seed));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
