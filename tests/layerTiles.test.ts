import { beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { brushRegistry, registerDefaultBrushes } from "@/engine/render/BrushRegistry";
import { renderDrawLayer } from "@/engine/render/renderDrawLayer";
import { StampBrush } from "@/engine/stamp/StampBrush";
import { LayerTiles, type TileView } from "@/engine/tiles/LayerTiles";
import { TileCache } from "@/engine/tiles/TileCache";
import { Scheduler } from "@/engine/tiles/Scheduler";
import type { ElementLike, ShapeElementLike, StrokeLike, TextElementLike } from "@/engine/types";

const scatterTest = new StampBrush({
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

beforeAll(() => {
  registerDefaultBrushes();
  if (!brushRegistry.has("scatter-test")) brushRegistry.register(scatterTest);
});

function line(id: string, x0: number, y0: number, x1: number, y1: number, overrides: Partial<StrokeLike> = {}): StrokeLike {
  const points = Array.from({ length: 41 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / 40,
    y: y0 + ((y1 - y0) * i) / 40 + Math.sin(i / 4) * 6,
    pressure: 0.6,
  }));
  return { id, points, color: "#1d1f24", size: 14, opacity: 1, brushStyle: "ink", timestamp: 0, taperStart: 0, taperEnd: 0, ...overrides } as StrokeLike;
}

function shape(id: string, x: number, y: number, overrides: Partial<ShapeElementLike> = {}): ShapeElementLike {
  return { id, shapeType: "rectangle", x, y, width: 180, height: 120, rotation: 0.2, strokeColor: "#E5644D", strokeWidth: 6, cornerRadius: 10, fillColor: "#4F7CAC", opacity: 0.8, look: "sketchy", seed: 3, ...overrides };
}

function text(id: string, x: number, y: number): TextElementLike {
  return { id, kind: "text", x, y, text: "tile border text", fontFamily: "sans", fontSize: 28, align: "left", color: "#222", opacity: 1, rotation: 0, containerId: null };
}

const lookupOf = (els: ElementLike[]) => new Map(els.map((e) => [e.id, e] as const));

function view(scale: number, originX = 0, originY = 0, w = 1100, h = 800, extra: Partial<TileView> = {}): TileView {
  return { originX, originY, scale, widthPx: w, heightPx: h, zoomStable: true, revealAll: true, frame: 1, ...extra };
}

function reference(els: ElementLike[], v: TileView) {
  const c = createCanvas(v.widthPx, v.heightPx);
  const ctx = c.getContext("2d");
  ctx.setTransform(v.scale, 0, 0, v.scale, v.originX, v.originY);
  renderDrawLayer(ctx as never, els, { lookup: lookupOf(els) });
  return ctx.getImageData(0, 0, v.widthPx, v.heightPx).data;
}

function makeTiles(getEls: () => ElementLike[]) {
  const cache = new TileCache(1e9);
  return new LayerTiles(cache, (ctx, els) => renderDrawLayer(ctx, els, { lookup: lookupOf(getEls()) }));
}

function composite(lt: LayerTiles, v: TileView) {
  const c = createCanvas(v.widthPx, v.heightPx);
  const ctx = c.getContext("2d");
  lt.composite(ctx as never, v, 1);
  return ctx.getImageData(0, 0, v.widthPx, v.heightPx).data;
}

function showFully(els: ElementLike[], v: TileView) {
  let current = els;
  const lt = makeTiles(() => current);
  lt.update(els, lookupOf(els), new Set(els.map((e) => e.id)), []);
  lt.syncVisible(v);
  return { lt, set: (next: ElementLike[]) => (current = next) };
}

function mismatch(a: Uint8ClampedArray, b: Uint8ClampedArray, rect?: { x0: number; y0: number; x1: number; y1: number; w: number }) {
  let bad = 0;
  let total = 0;
  const n = a.length / 4;
  for (let p = 0; p < n; p++) {
    if (rect) {
      const x = p % rect.w;
      const y = Math.floor(p / rect.w);
      if (x < rect.x0 || x >= rect.x1 || y < rect.y0 || y >= rect.y1) continue;
    }
    total++;
    const i = p * 4;
    for (let c = 0; c < 4; c++) {
      const va = c === 3 ? a[i + 3] : (a[i + c] * a[i + 3]) / 255;
      const vb = c === 3 ? b[i + 3] : (b[i + c] * b[i + 3]) / 255;
      if (Math.abs(va - vb) > 2) {
        bad++;
        break;
      }
    }
  }
  return bad / total;
}

function maxAlpha(d: Uint8ClampedArray) {
  let m = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > m) m = d[i];
  return m;
}

function inked(d: Uint8ClampedArray) {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
}

describe("LayerTiles", () => {
  it("seamless: ink, shapes, text across borders", () => {
    const els: ElementLike[] = [line("a", 300, 500, 760, 530), line("b", 500, 200, 530, 900), shape("s", 430, 440), text("t", 420, 505)];
    const v = view(1);
    const { lt } = showFully(els, v);
    expect(mismatch(composite(lt, v), reference(els, v))).toBeLessThan(0.001);
  });

  it("seamless: blurred and scattered strokes across borders", () => {
    const els: ElementLike[] = [
      line("air", 100, 300, 900, 360, { brushStyle: "airbrush", size: 60, softness: 1 }),
      line("sc", 200, 100, 600, 700, { brushStyle: "scatter-test" as never, size: 50 }),
      line("pen", 300, 600, 900, 200, { brushStyle: "pencil", size: 30 }),
    ];
    const v = view(1.37, -37, 23);
    const { lt } = showFully(els, v);
    expect(mismatch(composite(lt, v), reference(els, v))).toBeLessThan(0.001);
  });

  it("eraser holes match a full render", () => {
    const els: ElementLike[] = [
      line("base", 100, 480, 1000, 540, { size: 60 }),
      line("er", 360, 300, 660, 760, { brushStyle: "eraser", size: 40 }),
    ];
    const v = view(1);
    const { lt } = showFully(els, v);
    expect(mismatch(composite(lt, v), reference(els, v))).toBeLessThan(0.001);
  });

  it("stroke spanning many tiles matches full render", () => {
    const big: ElementLike[] = [line("huge", 20, 200, 500, 260, { size: 600 })];
    const v2 = view(2, -100, -100);
    expect(mismatch(composite(showFully(big, v2).lt, v2), reference(big, v2))).toBeLessThan(0.001);
    const many: ElementLike[] = Array.from({ length: 30 }, (_, i) => line(`m${i}`, i * 300, i * 150, i * 300 + 900, i * 150 + 400, { size: 80 }));
    const v05 = view(0.05, 20, 20, 600, 400);
    expect(mismatch(composite(showFully(many, v05).lt, v05), reference(many, v05))).toBeLessThan(0.001);
  });

  it("clear leaves nothing visible in the same frame", () => {
    const els: ElementLike[] = [line("a", 100, 100, 900, 600), shape("s", 500, 500)];
    const v = view(1);
    const { lt, set } = showFully(els, v);
    set([]);
    lt.update([], new Map(), new Set(["a", "s"]), []);
    lt.syncVisible(v);
    expect(inked(composite(lt, v))).toBe(0);
  });

  it("edit shows immediately while zoom unstable", () => {
    const far = line("far", 50, 50, 200, 80);
    const v1 = view(1);
    const { lt, set } = showFully([far], v1);
    const added = line("new", 600, 500, 900, 560, { size: 20 });
    const els = [far, added];
    set(els);
    const v15 = view(1.5, 0, 0, 1600, 1100, { zoomStable: false, revealAll: false });
    lt.update(els, lookupOf(els), new Set(["new"]), []);
    lt.syncVisible(v15);
    const rect = { x0: 512, y0: 512, x1: 1536, y1: 1024, w: 1600 };
    expect(mismatch(composite(lt, v15), reference(els, v15), rect)).toBeLessThan(0.001);
  });

  it("fallback never double-draws", () => {
    const els: ElementLike[] = [
      line("w1", 100, 200, 1000, 260, { opacity: 0.5, size: 40 }),
      line("w2", 100, 600, 1000, 640, { opacity: 0.5, size: 40 }),
    ];
    const v05 = view(0.5);
    const { lt } = showFully(els, v05);
    const v1 = view(1, 0, 0, 1100, 800, { zoomStable: true, revealAll: false });
    const ref = maxAlpha(reference(els, v1));
    expect(maxAlpha(composite(lt, v1))).toBeLessThanOrEqual(ref + 2);
    const s = new Scheduler();
    lt.schedule(v1, s, "L");
    s.run(1);
    const partial = view(1, 0, 0, 1100, 800, { revealAll: true });
    expect(maxAlpha(composite(lt, partial))).toBeLessThanOrEqual(ref + 2);
  });

  it("dirty fallback is skipped", () => {
    const keep = line("keep", 100, 100, 300, 120);
    const gone = line("gone", 320, 300, 480, 330, { size: 30 });
    const v1 = view(1);
    const { lt, set } = showFully([keep, gone], v1);
    set([keep]);
    lt.update([keep], lookupOf([keep]), new Set(["gone"]), []);
    lt.syncVisible(view(1, -5000, -5000));
    const v2 = view(1.25, 0, 0, 1100, 800, { zoomStable: false, revealAll: false });
    const out = composite(lt, v2);
    let goneInk = 0;
    for (let y = 340; y < 450; y++) for (let x = 390; x < 620; x++) if (out[(y * 1100 + x) * 4 + 3] > 0) goneInk++;
    expect(goneInk).toBe(0);
  });

  it("composite applies layer opacity", () => {
    const els: ElementLike[] = [line("a", 100, 300, 900, 320, { size: 40 })];
    const v = view(1);
    const { lt } = showFully(els, v);
    const c = createCanvas(v.widthPx, v.heightPx);
    const ctx = c.getContext("2d");
    lt.composite(ctx as never, v, 0.5);
    const m = maxAlpha(ctx.getImageData(0, 0, v.widthPx, v.heightPx).data);
    expect(m).toBeGreaterThanOrEqual(125);
    expect(m).toBeLessThanOrEqual(130);
  });

  it("scheduler fills visible tiles and the overview", () => {
    const els: ElementLike[] = [line("a", 100, 100, 3000, 1800, { size: 40 }), shape("s", 2500, 300)];
    let current = els;
    const lt = makeTiles(() => current);
    lt.update(els, lookupOf(els), new Set(els.map((e) => e.id)), []);
    const v = view(1, 0, 0, 1100, 800);
    const s = new Scheduler();
    lt.schedule(v, s, "L");
    while (s.pending) {
      s.run(1000);
      lt.schedule(v, s, "L");
    }
    expect(mismatch(composite(lt, v), reference(els, v))).toBeLessThan(0.001);
    const far = view(0.6, -900, -200, 1100, 800, { zoomStable: false, revealAll: false });
    expect(inked(composite(lt, far))).toBeGreaterThan(1000);
  });
});
