import { beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { setCanvasFactory } from "@/engine/render/canvasFactory";
import {
  brushRegistry,
  registerDefaultBrushes,
} from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { StampBrush } from "@/engine/stamp/StampBrush";
import type { StrokeLike } from "@/engine/types";

let drawImageCalls = 0;

setCanvasFactory((width, height) => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const draw = ctx.drawImage.bind(ctx);
  (ctx as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = (...a: unknown[]) => {
    drawImageCalls++;
    (draw as (...a: unknown[]) => void)(...a);
  };
  return canvas as unknown as HTMLCanvasElement;
});

const scattered = new StampBrush({
  key: "scatter-test",
  label: "Scatter",
  tips: ["round-hard", "round-medium"],
  spacing: 0.15,
  flow: 0.7,
  count: 2,
  scatter: 0.8,
  scatterBothAxes: true,
  sizeJitter: 0.4,
  angleMode: "random",
  flip: true,
});

function stroke(overrides: Partial<StrokeLike> = {}): StrokeLike {
  const points: StrokeLike["points"] = [];
  for (let i = 0; i <= 80; i++) {
    points.push({ x: 20 + i * 4.5, y: 100 + Math.sin(i / 9) * 60, pressure: 0.7 });
  }
  return {
    id: "speed",
    points,
    color: "#202020",
    size: 40,
    opacity: 1,
    brushStyle: "pencil",
    timestamp: 0,
    ...overrides,
  } as StrokeLike;
}

function draw(s: StrokeLike, w: number, h: number, dx: number, dy: number, brush?: StampBrush) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.translate(dx, dy);
  drawImageCalls = 0;
  if (brush) brush.render(ctx as never, s);
  else renderStroke(ctx as never, s, brushRegistry);
  return { data: ctx.getImageData(0, 0, w, h).data, calls: drawImageCalls };
}

function cropDiff(big: Uint8ClampedArray, bigW: number, small: Uint8ClampedArray, w: number, h: number, ox: number, oy: number) {
  let diff = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + oy) * bigW + (x + ox)) * 4;
      const j = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = c === 3 ? big[i + 3] : (big[i + c] * big[i + 3]) / 255;
        const b = c === 3 ? small[j + 3] : (small[j + c] * small[j + 3]) / 255;
        if (Math.abs(a - b) > 2) diff++;
      }
    }
  }
  return diff;
}

beforeAll(() => {
  registerDefaultBrushes();
});

describe("brush speedups", () => {
  it("stamp: clipped render equals crop of full render", () => {
    for (const [s, brush] of [
      [stroke(), undefined],
      [stroke({ brushStyle: "scatter-test" as never, id: "sc" }), scattered],
    ] as const) {
      const big = draw(s, 400, 200, 0, 0, brush);
      const small = draw(s, 128, 128, -136, -36, brush);
      expect(cropDiff(big.data, 400, small.data, 128, 128, 136, 36)).toBe(0);
    }
  });

  it("stamp: culling draws fewer dabs", () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ x: 20 + i * 4.5, y: 100 + Math.sin(i / 9) * 60, pressure: 0.7 }));
    const s = stroke({ brushStyle: "scatter-test" as never, id: "cull", points });
    const big = draw(s, 940, 200, 0, 0, scattered);
    const small = draw(s, 128, 128, -136, -36, scattered);
    expect(small.calls).toBeLessThan(big.calls * 0.4);
  });

  it("stamp: memoized points follow the stroke object", () => {
    const s = stroke({ id: "memo" });
    const a = draw(s, 400, 200, 0, 0);
    const b = draw(s, 400, 200, 0, 0);
    const c = draw({ ...s, size: 20 }, 400, 200, 0, 0);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it("ink: memoized path renders identically twice", () => {
    const s = stroke({ brushStyle: "ink", id: "ink-memo", size: 12 });
    const a = draw(s, 400, 200, 0, 0);
    const b = draw(s, 400, 200, 0, 0);
    const c = draw({ ...s, size: 24 }, 400, 200, 0, 0);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });
});
