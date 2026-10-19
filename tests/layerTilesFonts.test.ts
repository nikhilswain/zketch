import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";

const fontScale = vi.hoisted(() => ({ k: 1 }));

vi.mock("@/engine/render/fonts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/engine/render/fonts")>();
  return { ...real, measureText: (font: string, text: string) => real.measureText(font, text) * fontScale.k };
});

import { registerDefaultBrushes } from "@/engine/render/BrushRegistry";
import { renderDrawLayer } from "@/engine/render/renderDrawLayer";
import { LayerTiles, type TileView } from "@/engine/tiles/LayerTiles";
import { TileCache } from "@/engine/tiles/TileCache";
import { Scheduler } from "@/engine/tiles/Scheduler";
import type { ArrowElementLike, ElementLike, TextElementLike } from "@/engine/types";

beforeAll(() => {
  registerDefaultBrushes();
});

const lookupOf = (els: ElementLike[]) => new Map(els.map((e) => [e.id, e] as const));
const view: TileView = { originX: 0, originY: 0, scale: 1, widthPx: 1100, heightPx: 600, zoomStable: true, revealAll: true, frame: 1 };

function inkRight(d: Uint8ClampedArray, x0: number) {
  let n = 0;
  for (let y = 0; y < view.heightPx; y++) for (let x = x0; x < view.widthPx; x++) if (d[(y * view.widthPx + x) * 4 + 3] > 0) n++;
  return n;
}

function rightInkAfterFontLoad(els: ElementLike[]) {
  fontScale.k = 0.3;
  const lt = new LayerTiles(new TileCache(1e9), (ctx, e) => renderDrawLayer(ctx, e, { lookup: lookupOf(els) }));
  lt.update(els, lookupOf(els), new Set(els.map((e) => e.id)), []);
  lt.syncVisible(view);
  fontScale.k = 1;
  lt.remeasure();
  lt.markAllStale();
  const s = new Scheduler();
  lt.schedule(view, s, "L");
  while (s.pending) {
    s.run(1e6);
    lt.schedule(view, s, "L");
  }
  const tiled = createCanvas(view.widthPx, view.heightPx);
  lt.composite(tiled.getContext("2d") as never, view, 1);
  const ref = createCanvas(view.widthPx, view.heightPx);
  renderDrawLayer(ref.getContext("2d") as never, els, { lookup: lookupOf(els) });
  return {
    expected: inkRight(ref.getContext("2d").getImageData(0, 0, view.widthPx, view.heightPx).data, 512),
    got: inkRight(tiled.getContext("2d").getImageData(0, 0, view.widthPx, view.heightPx).data, 512),
  };
}

describe("fonts loading after first paint", () => {
  it("C2: free text is re-measured so wider text is not clipped at a tile border", () => {
    const free: TextElementLike = { id: "t", kind: "text", x: 420, y: 300, text: "free text near the border", fontFamily: "sans", fontSize: 24, align: "left", color: "#000", opacity: 1, rotation: 0, containerId: null };
    const { expected, got } = rightInkAfterFontLoad([free]);
    expect(expected).toBeGreaterThan(100);
    expect(got).toBeGreaterThanOrEqual(expected * 0.98);
  });

  it("C2: an arrow label is re-measured so it is not clipped at a tile border", () => {
    const arrow: ArrowElementLike = { id: "a", kind: "arrow", start: { x: 440, y: 200 }, end: { x: 460, y: 200 }, bend: 0, startBinding: null, endBinding: null, startHead: "none", endHead: "none", strokeColor: "#000", strokeWidth: 2, opacity: 1, look: "clean", seed: 1 };
    const label: TextElementLike = { id: "l", kind: "text", x: 0, y: 0, text: "a much longer label sitting on a short arrow", fontFamily: "sans", fontSize: 20, align: "center", color: "#000", opacity: 1, rotation: 0, containerId: "a" };
    const { expected, got } = rightInkAfterFontLoad([arrow, label]);
    expect(expected).toBeGreaterThan(100);
    expect(got).toBeGreaterThanOrEqual(expected * 0.98);
  });
});
