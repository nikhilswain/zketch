import { beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { brushRegistry, registerDefaultBrushes } from "@/engine/render/BrushRegistry";
import { renderDrawLayer } from "@/engine/render/renderDrawLayer";
import { StampBrush } from "@/engine/stamp/StampBrush";
import { measureText } from "@/engine/render/fonts";
import { labelPlacement } from "@/engine/geometry/labels";
import { boxBounds } from "@/engine/geometry/outline";
import { renderBounds } from "@/engine/tiles/renderBounds";
import { changedIds, diffLayer, regionsForIds } from "@/engine/tiles/layerDiff";
import { TILE, tileBounds, tileRange } from "@/engine/tiles/tileMath";
import { TileCache, TileSet, type Tile } from "@/engine/tiles/TileCache";
import { Scheduler } from "@/engine/tiles/Scheduler";
import { ChangeTracker } from "@/engine/tiles/changeTracker";
import type { ArrowElementLike, ElementLike, ShapeElementLike, StrokeLike, TextElementLike } from "@/engine/types";

export function strokeEl(id: string, overrides: Partial<StrokeLike> = {}): StrokeLike {
  return {
    id,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 },
    ],
    color: "#000",
    size: 10,
    opacity: 1,
    brushStyle: "ink",
    timestamp: 0,
    ...overrides,
  } as StrokeLike;
}

export function arrowEl(id: string, overrides: Partial<ArrowElementLike> = {}): ArrowElementLike {
  return {
    id,
    kind: "arrow",
    start: { x: 0, y: 0 },
    end: { x: 20, y: 0 },
    bend: 0,
    startBinding: null,
    endBinding: null,
    startHead: "none",
    endHead: "arrow",
    strokeColor: "#000",
    strokeWidth: 2,
    opacity: 1,
    look: "clean",
    seed: 1,
    ...overrides,
  };
}

export function labelEl(id: string, containerId: string, text: string): TextElementLike {
  return {
    id,
    kind: "text",
    x: 0,
    y: 0,
    text,
    fontFamily: "sans",
    fontSize: 20,
    align: "center",
    color: "#000",
    opacity: 1,
    rotation: 0,
    containerId,
  };
}

function lookupOf(elements: ElementLike[]) {
  return new Map(elements.map((e) => [e.id, e] as const));
}

function width(b: { minX: number; maxX: number }) {
  return b.maxX - b.minX;
}

export function shapeEl(id: string, overrides: Partial<ShapeElementLike> = {}): ShapeElementLike {
  return {
    id,
    shapeType: "rectangle",
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    rotation: 0,
    strokeColor: "#000",
    strokeWidth: 8,
    cornerRadius: 0,
    fillColor: null,
    opacity: 1,
    look: "clean",
    seed: 7,
    ...overrides,
  };
}

export const scatterTest = new StampBrush({
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

describe("tile math", () => {
  it("tileRange covers exactly the touched tiles", () => {
    expect(tileRange({ minX: 0, minY: 0, maxX: 1023, maxY: 10 }, 1)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 0 });
    expect(tileRange({ minX: 0, minY: 0, maxX: 1023, maxY: 10 }, 2)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 0 });
    expect(tileRange({ minX: 0, minY: 0, maxX: 1024, maxY: 512 }, 1)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 0 });
    expect(tileRange({ minX: -1, minY: -1, maxX: -1, maxY: -1 }, 1)).toEqual({ x0: -1, y0: -1, x1: -1, y1: -1 });
  });

  it("tileBounds inverts tileRange", () => {
    expect(tileBounds(1, -1, 2)).toEqual({ minX: 256, minY: -256, maxX: 512, maxY: 0 });
    const b = tileBounds(3, 5, 1.37);
    const r = tileRange({ minX: b.minX + 0.01, minY: b.minY + 0.01, maxX: b.maxX - 0.01, maxY: b.maxY - 0.01 }, 1.37);
    expect(r).toEqual({ x0: 3, y0: 5, x1: 3, y1: 5 });
  });
});

describe("render bounds", () => {
  it("renderBounds pads strokes by brush reach", () => {
    const lookup = new Map();
    const ink = renderBounds(strokeEl("i"), lookup)!;
    expect(ink.minX).toBeLessThanOrEqual(-15);
    expect(ink.minY).toBeLessThanOrEqual(-15);
    expect(ink.maxX).toBeGreaterThanOrEqual(115);
    expect(ink.maxY).toBeGreaterThanOrEqual(15);
    expect(renderBounds(strokeEl("e", { brushStyle: "eraser" }), lookup)).not.toBeNull();
    const splatter = renderBounds(strokeEl("s", { brushStyle: "splatter" }), lookup)!;
    expect(width(splatter)).toBeGreaterThan(width(ink));
    const soft = renderBounds(strokeEl("a1", { brushStyle: "airbrush", softness: 1 }), lookup)!;
    const hard = renderBounds(strokeEl("a0", { brushStyle: "airbrush", softness: 0 }), lookup)!;
    expect(width(soft)).toBeGreaterThan(width(hard));
  });

  it("renderBounds includes label boxes", () => {
    const arrow = arrowEl("a");
    const label = labelEl("l", "a", "a label much wider than the arrow");
    const lookup = lookupOf([arrow, label]);
    const box = boxBounds(labelPlacement(arrow, label, lookup, measureText)!.box);
    const b = renderBounds(arrow, lookup, label)!;
    expect(b.minX).toBeLessThanOrEqual(box.minX);
    expect(b.maxX).toBeGreaterThanOrEqual(box.maxX);
    expect(b.minY).toBeLessThanOrEqual(box.minY);
    expect(b.maxY).toBeGreaterThanOrEqual(box.maxY);
  });
});

describe("render bounds cover painted pixels", () => {
  it("renderBounds contains every painted pixel", () => {
    const cases: ElementLike[] = [
      shapeEl("s1", { look: "sketchy", strokeWidth: 12, shapeType: "diamond" }),
      shapeEl("s2", { look: "pencil", strokeWidth: 10, shapeType: "triangle", rotation: 0.4 }),
      shapeEl("s3", { look: "sketchy", strokeWidth: 6, shapeType: "circle", cornerRadius: 30 }),
      arrowEl("a1", { look: "sketchy", strokeWidth: 10, startHead: "triangle", end: { x: 220, y: 90 } }),
      strokeEl("p1", { brushStyle: "scatter-test" as never, size: 30 }),
      strokeEl("p2", { brushStyle: "airbrush", size: 30, softness: 1 }),
      strokeEl("p3", { brushStyle: "calligraphy", size: 30, angle: 30 }),
    ];
    for (const el of cases) {
      const W = 800;
      const H = 600;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");
      ctx.translate(300, 250);
      renderDrawLayer(ctx as never, [el], { lookup: lookupOf([el]) });
      const d = ctx.getImageData(0, 0, W, H).data;
      const b = renderBounds(el, lookupOf([el]))!;
      let outside = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] === 0) continue;
          const wx = x - 300 + 0.5;
          const wy = y - 250 + 0.5;
          if (wx < b.minX - 1 || wx > b.maxX + 1 || wy < b.minY - 1 || wy > b.maxY + 1) outside++;
        }
      }
      expect({ id: el.id, outside }).toEqual({ id: el.id, outside: 0 });
    }
  });
});

describe("layer diff", () => {
  const empty = new Set<string>();
  const first = (els: ElementLike[]) => diffLayer([], new Map(), els, lookupOf(els), empty);

  it("unchanged layer has no regions", () => {
    const els = [strokeEl("a"), strokeEl("b", { points: [{ x: 500, y: 500, pressure: 0.5 }] })];
    const d = diffLayer(els, first(els).bounds, els, lookupOf(els), empty);
    expect(d.regions).toEqual([]);
    expect(d.appended).toBeNull();
  });

  it("appending one stroke reports appended and its bounds only", () => {
    const a = strokeEl("a");
    const b = strokeEl("b", { points: [{ x: 900, y: 900, pressure: 0.5 }] });
    const d = diffLayer([a], first([a]).bounds, [a, b], lookupOf([a, b]), new Set(["b"]));
    expect(d.appended).toBe(b);
    expect(d.regions).toEqual([renderBounds(b, lookupOf([a, b]))]);
  });

  it("moving a stroke dirties old and new bounds", () => {
    const a = strokeEl("a");
    const moved = strokeEl("a", { points: [{ x: 300, y: 300, pressure: 0.5 }] });
    const d = diffLayer([a], first([a]).bounds, [moved], lookupOf([moved]), new Set(["a"]));
    expect(d.appended).toBeNull();
    expect(d.regions).toContainEqual(renderBounds(a, lookupOf([a])));
    expect(d.regions).toContainEqual(renderBounds(moved, lookupOf([moved])));
  });

  it("deleting dirties old bounds", () => {
    const a = strokeEl("a");
    const b = strokeEl("b", { points: [{ x: 900, y: 900, pressure: 0.5 }] });
    const d = diffLayer([a, b], first([a, b]).bounds, [a], lookupOf([a]), new Set(["b"]));
    expect(d.regions).toEqual([renderBounds(b, lookupOf([b]))]);
    expect(d.bounds.has("b")).toBe(false);
  });

  it("arrow bound across layers is dirty when its target moves", () => {
    const s1 = shapeEl("s1", { x: 300, y: 0 });
    const s1moved = shapeEl("s1", { x: 300, y: 400 });
    const arrow = arrowEl("ar", { endBinding: { elementId: "s1" }, end: { x: 300, y: 60 } });
    const oldLookup = lookupOf([arrow, s1]);
    const newLookup = lookupOf([arrow, s1moved]);
    const prevA = diffLayer([], new Map(), [arrow], oldLookup, empty).bounds;
    const globalChanged = new Set([...changedIds([s1], [s1moved]), ...changedIds([arrow], [arrow])]);
    expect(globalChanged).toEqual(new Set(["s1"]));
    const d = diffLayer([arrow], prevA, [arrow], newLookup, globalChanged);
    expect(d.regions).toContainEqual(renderBounds(arrow, oldLookup));
    expect(d.regions).toContainEqual(renderBounds(arrow, newLookup));
  });

  it("a label moves with its container", () => {
    const box = shapeEl("box");
    const boxMoved = shapeEl("box", { x: 500 });
    const label = labelEl("lb", "box", "hi");
    const prev = diffLayer([], new Map(), [box, label], lookupOf([box, label]), empty).bounds;
    const d = diffLayer([box, label], prev, [boxMoved, label], lookupOf([boxMoved, label]), new Set(["box"]));
    expect(d.regions).toContainEqual(prev.get("lb"));
  });

  it("regionsForIds skips unknown and null bounds", () => {
    const a = strokeEl("a");
    const bounds = first([a]).bounds;
    expect(regionsForIds(["a", "zzz"], bounds)).toEqual([bounds.get("a")]);
  });
});

describe("tile cache", () => {
  const TILE_BYTES = TILE * TILE * 4;
  const tile = (cache: TileCache, tx: number, ty: number, lastUsed: number): Tile => ({
    tx,
    ty,
    canvas: cache.alloc(),
    state: "ready",
    lastUsed,
  });

  it("evict keeps protected and pinned tiles", () => {
    const cache = new TileCache(3 * TILE_BYTES);
    const normal = new TileSet(1);
    const pinned = new TileSet(0.25, true);
    cache.add(normal);
    cache.add(pinned);
    const tiles = [1, 2, 3, 4, 5].map((n) => tile(cache, n, 0, n));
    tiles.forEach((t) => normal.set(t));
    pinned.set(tile(cache, 0, 0, 0));
    cache.evict(new Set([tiles[4]]));
    expect([...normal.tiles()].map((t) => t.tx).sort()).toEqual([4, 5]);
    expect(pinned.size).toBe(1);
    expect(cache.bytes()).toBe(3 * TILE_BYTES);
  });

  it("evict reports honestly when protected tiles exceed the budget", () => {
    const cache = new TileCache(1 * TILE_BYTES);
    const set = new TileSet(1);
    cache.add(set);
    const a = tile(cache, 0, 0, 1);
    const b = tile(cache, 1, 0, 2);
    set.set(a);
    set.set(b);
    cache.evict(new Set([a, b]));
    expect(set.size).toBe(2);
    expect(cache.bytes()).toBe(2 * TILE_BYTES);
  });

  it("markDirty returns only intersecting tiles", () => {
    const cache = new TileCache(100 * TILE_BYTES);
    const set = new TileSet(1);
    set.set(tile(cache, 0, 0, 0));
    set.set(tile(cache, 1, 0, 0));
    set.set(tile(cache, 5, 5, 0));
    const hit = set.markDirty({ minX: 500, minY: 10, maxX: 520, maxY: 20 });
    expect(hit.map((t) => t.tx).sort()).toEqual([0, 1]);
    expect(set.get(5, 5)!.state).toBe("ready");
    expect(set.get(0, 0)!.state).toBe("dirty");
  });

  it("released canvases are reused", () => {
    const cache = new TileCache(100 * TILE_BYTES);
    const c = cache.alloc();
    cache.release(c);
    expect(cache.alloc()).toBe(c);
  });
});

describe("scheduler", () => {
  it("scheduler runs by priority within budget", () => {
    let t = 0;
    const s = new Scheduler(() => t);
    const log: string[] = [];
    const job = (key: string, priority: number) => {
      let steps = 0;
      return {
        key,
        priority,
        step: () => {
          t += 3;
          log.push(key);
          return ++steps >= 2;
        },
      };
    };
    s.add(job("two", 2));
    s.add(job("zero", 0));
    s.add(job("one", 1));
    expect(s.run(7)).toBe(1);
    expect(log).toEqual(["zero", "zero", "one"]);
    expect(s.pending).toBe(2);
  });

  it("add with an existing key replaces the job", () => {
    let t = 0;
    const s = new Scheduler(() => t);
    const ran: string[] = [];
    s.add({ key: "k", priority: 0, step: () => (ran.push("old"), true) });
    s.add({ key: "k", priority: 0, step: () => (ran.push("new"), true) });
    expect(s.pending).toBe(1);
    s.run(10);
    expect(ran).toEqual(["new"]);
  });

  it("cancel removes jobs by key prefix", () => {
    const s = new Scheduler(() => 0);
    s.add({ key: "L1:a", priority: 0, step: () => true });
    s.add({ key: "L1:b", priority: 0, step: () => true });
    s.add({ key: "L2:a", priority: 0, step: () => true });
    s.cancel("L1:");
    expect(s.pending).toBe(1);
  });
});

describe("change tracker", () => {
  const layer = (id: string, elements: ElementLike[]) => ({ id, elements });

  it("plain edits report changed ids to every layer", () => {
    const t = new ChangeTracker();
    const a = strokeEl("a");
    const b = strokeEl("b");
    t.next([layer("L1", [a]), layer("L2", [b])]);
    const b2 = strokeEl("b", { size: 20 });
    const res = t.next([layer("L1", [a]), layer("L2", [b2])]);
    expect([...res.get("L1")!]).toEqual(["b"]);
    expect([...res.get("L2")!]).toEqual(["b"]);
  });

  it("hiding a layer marks its elements changed for the others", () => {
    const t = new ChangeTracker();
    const arrow = arrowEl("ar", { endBinding: { elementId: "s1" } });
    const s1 = shapeEl("s1");
    t.next([layer("A", [arrow]), layer("B", [s1])]);
    const res = t.next([layer("A", [arrow])]);
    expect(res.get("A")!.has("s1")).toBe(true);
  });

  it("a layer shown again gets the changes it missed while hidden", () => {
    const t = new ChangeTracker();
    const arrow = arrowEl("ar", { endBinding: { elementId: "s1" } });
    const s1 = shapeEl("s1");
    const moved = shapeEl("s1", { x: 400 });
    t.next([layer("A", [arrow]), layer("B", [s1])]);
    t.next([layer("B", [s1])]);
    t.next([layer("B", [moved])]);
    t.next([layer("B", [moved])]);
    const res = t.next([layer("A", [arrow]), layer("B", [moved])]);
    expect(res.get("A")!.has("s1")).toBe(true);
  });
});
