import type { ElementLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import type { ElementLookup } from "../render/lookup";
import { labelsByContainer } from "../geometry/labels";
import { diffLayer, regionsForIds } from "./layerDiff";
import { TILE, intersects, scaleKey, tileBounds, tileRange, union, type Bounds, type TileRange } from "./tileMath";
import { TileSet, type Tile, type TileCache } from "./TileCache";
import { renderBounds } from "./renderBounds";
import type { Job, Scheduler } from "./Scheduler";

export interface TileView {
  originX: number;
  originY: number;
  scale: number;
  widthPx: number;
  heightPx: number;
  zoomStable: boolean;
  revealAll: boolean;
  frame: number;
}

export type RenderElements = (ctx: CanvasRenderingContext2D, elements: readonly ElementLike[]) => void;

const MAX_SETS = 4;
const MAX_FALLBACK_TILES = 64;
const LOG_LIMIT = 256;
const TILE_BYTES = TILE * TILE * 4;

function viewRect(v: TileView): Bounds {
  return {
    minX: -v.originX / v.scale,
    minY: -v.originY / v.scale,
    maxX: (v.widthPx - v.originX) / v.scale,
    maxY: (v.heightPx - v.originY) / v.scale,
  };
}

function clipRect(a: Bounds, b: Bounds): Bounds | null {
  const r = {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
  return r.minX < r.maxX && r.minY < r.maxY ? r : null;
}

function* slots(r: TileRange) {
  for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) yield [tx, ty] as const;
}

function sameBounds(a: Bounds | null, b: Bounds | null) {
  if (!a || !b) return a === b;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

function isLabel(el: ElementLike) {
  return elementKind(el) === "text" && !!(el as TextElementLike).containerId;
}

export class LayerTiles {
  overviewPx = 2048;
  private elements: readonly ElementLike[] = [];
  private lookup: ElementLookup = new Map();
  private bounds = new Map<string, Bounds | null>();
  private labels = new Map<string, TextElementLike>();
  private content: Bounds | null = null;
  private sets: TileSet[] = [];
  private setUsed = new Map<TileSet, number>();
  private overview: TileSet | null = null;
  private nextOverview: TileSet | null = null;
  private pending: Bounds[] = [];
  private version = 0;
  private log: { v: number; r: Bounds }[] = [];
  private logFloor = 0;
  private generation = 0;
  private occupancy = new Map<string, Map<string, boolean>>();
  private forced = new WeakSet<Tile>();
  private frame = 0;

  constructor(
    private cache: TileCache,
    private render: RenderElements,
    private now: () => number = () => performance.now(),
  ) {}

  update(
    elements: readonly ElementLike[],
    lookup: ElementLookup,
    globalChanged: Set<string>,
    extraDirtyIds: Iterable<string>,
  ): void {
    const extra = [...extraDirtyIds];
    if (elements === this.elements && extra.length === 0 && globalChanged.size === 0) return;
    const before = this.bounds;
    const d = diffLayer(this.elements, before, elements, lookup, globalChanged);
    const regions = [...d.regions, ...regionsForIds(extra, before), ...regionsForIds(extra, d.bounds)];
    this.elements = elements;
    this.lookup = lookup;
    this.bounds = d.bounds;
    this.labels = labelsByContainer(elements);
    if (!regions.length) return;
    this.invalidate(regions);
    this.pending.push(...regions);
    const appendedBounds = d.appended && extra.length === 0 ? d.bounds.get(d.appended.id) : null;
    for (const set of this.allSets()) {
      if (appendedBounds) this.appendTo(set, d.appended!, appendedBounds);
      else for (const r of regions) set.markDirty(r);
    }
  }

  syncVisible(v: TileView): void {
    this.frame = v.frame;
    if (!this.pending.length) return;
    const pending = this.pending;
    this.pending = [];
    const area = this.content ? clipRect(viewRect(v), this.content) : null;
    if (!area) return;
    let target: TileSet | null = null;
    for (const [tx, ty] of slots(tileRange(area, v.scale))) {
      const r = tileBounds(tx, ty, v.scale);
      if (!pending.some((p) => intersects(p, r))) continue;
      target ??= this.target(v.scale);
      const tile = target.get(tx, ty);
      if (tile && tile.state === "ready") continue;
      this.renderNow(target, tx, ty);
    }
  }

  schedule(v: TileView, scheduler: Scheduler, layerKey: string): void {
    this.frame = v.frame;
    this.dropDirtyFallbacks(v.scale);
    if (!this.content) return;
    const s = v.scale;
    if (v.zoomStable) {
      const area = clipRect(viewRect(v), this.content);
      if (area) {
        const target = this.target(s);
        const range = tileRange(area, s);
        const view = tileRange(viewRect(v), s);
        const cx = (view.x0 + view.x1) / 2;
        const cy = (view.y0 + view.y1) / 2;
        for (const [tx, ty] of slots(range)) {
          this.enqueueIfNeeded(scheduler, layerKey, target, tx, ty, Math.hypot(tx - cx, ty - cy));
        }
        const ring = { x0: range.x0 - 1, y0: range.y0 - 1, x1: range.x1 + 1, y1: range.y1 + 1 };
        const prefetch: (readonly [number, number])[] = [];
        for (const [tx, ty] of slots(ring)) {
          if (tx >= range.x0 && tx <= range.x1 && ty >= range.y0 && ty <= range.y1) continue;
          if (!this.occupied(s, tx, ty)) continue;
          const t = target.get(tx, ty);
          if (!t || t.state !== "ready") prefetch.push([tx, ty]);
        }
        if (prefetch.length && this.cache.headroom() >= prefetch.length * TILE_BYTES) {
          for (const [tx, ty] of prefetch) {
            this.enqueue(scheduler, layerKey, target, tx, ty, 2000 + Math.hypot(tx - cx, ty - cy));
          }
        }
      }
    }
    const o = this.overviewScale();
    if (!this.overview || scaleKey(this.overview.scale) !== scaleKey(o)) {
      if (!this.nextOverview || scaleKey(this.nextOverview.scale) !== scaleKey(o)) {
        if (this.nextOverview) this.cache.remove(this.nextOverview);
        this.nextOverview = new TileSet(o, true);
        this.cache.add(this.nextOverview);
      }
    } else if (this.nextOverview) {
      this.cache.remove(this.nextOverview);
      this.nextOverview = null;
    }
    const ov = this.nextOverview ?? this.overview!;
    let complete = true;
    let i = 0;
    for (const [tx, ty] of slots(tileRange(this.content, o))) {
      if (!this.occupied(o, tx, ty)) continue;
      const t = ov.get(tx, ty);
      if (t && t.state === "ready") continue;
      complete = false;
      this.enqueue(scheduler, layerKey, ov, tx, ty, 1000 + i++);
    }
    if (this.nextOverview && complete) {
      if (this.overview) {
        this.cache.remove(this.overview);
        this.setUsed.delete(this.overview);
      }
      this.overview = this.nextOverview;
      this.nextOverview = null;
    }
  }

  composite(ctx: CanvasRenderingContext2D, v: TileView, opacity: number): Set<Tile> {
    this.frame = v.frame;
    const drawn = new Set<Tile>();
    const area = this.content ? clipRect(viewRect(v), this.content) : null;
    if (!area) return drawn;
    const s = v.scale;
    const target = this.findSet(s);
    const range = tileRange(area, s);
    if (target) this.setUsed.set(target, v.frame);
    this.pruneOccupancy(s);
    let allReady = true;
    if (!v.revealAll) {
      for (const [tx, ty] of slots(range)) {
        if (!this.occupied(s, tx, ty)) continue;
        const t = target?.get(tx, ty);
        if (!t || t.state === "dirty") {
          allReady = false;
          break;
        }
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    for (const [tx, ty] of slots(range)) {
      if (!this.occupied(s, tx, ty)) continue;
      const tile = target?.get(tx, ty);
      const drawable = !!tile && tile.state !== "dirty";
      if (tile) drawn.add(tile);
      if (drawable && (v.revealAll || allReady || this.forced.has(tile!))) {
        this.drawTile(ctx, tile!, v.originX + tx * TILE, v.originY + ty * TILE, TILE);
        continue;
      }
      if (this.drawFallback(ctx, v, tx, ty, target, drawn)) continue;
      if (drawable) this.drawTile(ctx, tile!, v.originX + tx * TILE, v.originY + ty * TILE, TILE);
    }
    ctx.restore();
    return drawn;
  }

  markAllStale(): void {
    this.generation++;
    for (const set of this.allSets()) set.markAllStale();
  }

  remeasure(): void {
    const regions: Bounds[] = [];
    for (const el of this.elements) {
      if (elementKind(el) === "stroke") continue;
      const before = this.bounds.get(el.id) ?? null;
      const after = renderBounds(el, this.lookup, this.labels.get(el.id));
      if (sameBounds(before, after)) continue;
      this.bounds.set(el.id, after);
      if (before) regions.push(before);
      if (after) regions.push(after);
    }
    if (regions.length) this.invalidate(regions);
  }

  private invalidate(regions: Bounds[]) {
    this.version++;
    this.occupancy.clear();
    for (const r of regions) this.log.push({ v: this.version, r });
    if (this.log.length > LOG_LIMIT) {
      const dropped = this.log.splice(0, this.log.length - LOG_LIMIT);
      this.logFloor = Math.max(this.logFloor, dropped[dropped.length - 1].v);
    }
    this.content = null;
    for (const b of this.bounds.values()) if (b) this.content = this.content ? union(this.content, b) : b;
  }

  dispose(): void {
    for (const set of this.allSets()) this.cache.remove(set);
    this.setUsed.clear();
    this.occupancy.clear();
    this.sets = [];
    this.overview = null;
    this.nextOverview = null;
  }

  private allSets(): TileSet[] {
    const out = [...this.sets];
    if (this.overview) out.push(this.overview);
    if (this.nextOverview) out.push(this.nextOverview);
    return out;
  }

  private hasSet(set: TileSet) {
    return this.sets.includes(set) || set === this.overview || set === this.nextOverview;
  }

  private findSet(scale: number): TileSet | null {
    const k = scaleKey(scale);
    return this.sets.find((set) => scaleKey(set.scale) === k) ?? null;
  }

  private target(scale: number): TileSet {
    const found = this.findSet(scale);
    if (found) {
      this.setUsed.set(found, this.frame);
      return found;
    }
    const set = new TileSet(scale);
    this.cache.add(set);
    this.sets.unshift(set);
    this.setUsed.set(set, this.frame);
    while (this.sets.length > MAX_SETS) {
      const victim = this.sets
        .filter((x) => x !== set)
        .reduce((a, b) => ((this.setUsed.get(a) ?? 0) <= (this.setUsed.get(b) ?? 0) ? a : b));
      this.sets.splice(this.sets.indexOf(victim), 1);
      this.setUsed.delete(victim);
      this.cache.remove(victim);
    }
    return set;
  }

  private overviewScale(): number {
    const c = this.content!;
    const dim = Math.max(1, c.maxX - c.minX, c.maxY - c.minY);
    return Math.pow(2, Math.floor(Math.log2(this.overviewPx / dim)));
  }

  private pruneOccupancy(scale: number) {
    const keep = new Set([scaleKey(scale), ...this.allSets().map((set) => scaleKey(set.scale))]);
    for (const k of this.occupancy.keys()) if (!keep.has(k)) this.occupancy.delete(k);
  }

  private occupied(scale: number, tx: number, ty: number): boolean {
    const sk = scaleKey(scale);
    let byScale = this.occupancy.get(sk);
    if (!byScale) {
      byScale = new Map();
      this.occupancy.set(sk, byScale);
    }
    const k = `${tx},${ty}`;
    let hit = byScale.get(k);
    if (hit === undefined) {
      const r = tileBounds(tx, ty, scale);
      hit = false;
      for (const b of this.bounds.values()) {
        if (b && intersects(b, r)) {
          hit = true;
          break;
        }
      }
      byScale.set(k, hit);
    }
    return hit;
  }

  private unitsIn(r: Bounds): ElementLike[][] {
    const units: ElementLike[][] = [];
    for (const el of this.elements) {
      if (isLabel(el)) continue;
      const b = this.bounds.get(el.id);
      const label = this.labels.get(el.id);
      const lb = label ? this.bounds.get(label.id) : null;
      if ((b && intersects(b, r)) || (lb && intersects(lb, r))) units.push(label ? [el, label] : [el]);
    }
    return units;
  }

  private paint(ctx: CanvasRenderingContext2D, scale: number, tx: number, ty: number, units: ElementLike[][]) {
    ctx.setTransform(scale, 0, 0, scale, -tx * TILE, -ty * TILE);
    for (const unit of units) this.render(ctx, unit);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private renderNow(set: TileSet, tx: number, ty: number) {
    const units = this.unitsIn(tileBounds(tx, ty, set.scale));
    if (!units.length) {
      this.dropTile(set, tx, ty);
      return;
    }
    let tile = set.get(tx, ty);
    if (!tile) {
      tile = { tx, ty, canvas: this.cache.alloc(), state: "ready", lastUsed: this.frame };
      set.set(tile);
    }
    const ctx = tile.canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    this.paint(ctx, set.scale, tx, ty, units);
    tile.state = "ready";
    tile.lastUsed = this.frame;
    this.forced.add(tile);
  }

  private appendTo(set: TileSet, el: ElementLike, b: Bounds) {
    const label = this.labels.get(el.id);
    for (const [tx, ty] of slots(tileRange(b, set.scale))) {
      const tile = set.get(tx, ty);
      if (!tile || tile.state === "dirty") continue;
      this.paint(tile.canvas.getContext("2d")!, set.scale, tx, ty, [label ? [el, label] : [el]]);
    }
  }

  private dropTile(set: TileSet, tx: number, ty: number) {
    const old = set.delete(tx, ty);
    if (old) this.cache.release(old.canvas);
  }

  private dropDirtyFallbacks(scale: number) {
    const k = scaleKey(scale);
    for (const set of [...this.sets]) {
      if (scaleKey(set.scale) === k) continue;
      for (const tile of [...set.tiles()]) if (tile.state === "dirty") this.dropTile(set, tile.tx, tile.ty);
      if (set.size === 0) {
        this.sets.splice(this.sets.indexOf(set), 1);
        this.setUsed.delete(set);
        this.cache.remove(set);
      }
    }
  }

  private drawTile(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, size: number) {
    ctx.drawImage(tile.canvas, x, y, size, size);
    tile.lastUsed = this.frame;
  }

  private drawFallback(
    ctx: CanvasRenderingContext2D,
    v: TileView,
    tx: number,
    ty: number,
    target: TileSet | null,
    drawn: Set<Tile>,
  ): boolean {
    const r = tileBounds(tx, ty, v.scale);
    const candidates = this.sets
      .filter((set) => set !== target)
      .sort((a, b) => (this.setUsed.get(b) ?? 0) - (this.setUsed.get(a) ?? 0));
    if (this.overview) candidates.push(this.overview);
    for (const set of candidates) {
      const fr = tileRange(r, set.scale);
      if ((fr.x1 - fr.x0 + 1) * (fr.y1 - fr.y0 + 1) > MAX_FALLBACK_TILES) continue;
      const tiles: Tile[] = [];
      let valid = true;
      for (const [fx, fy] of slots(fr)) {
        const t = set.get(fx, fy);
        if (t) {
          if (t.state === "dirty") valid = false;
          else tiles.push(t);
        } else if (this.occupied(set.scale, fx, fy)) {
          valid = false;
        }
        if (!valid) break;
      }
      if (!valid) continue;
      const k = v.scale / set.scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(v.originX + tx * TILE, v.originY + ty * TILE, TILE, TILE);
      ctx.clip();
      for (const t of tiles) {
        const x0 = Math.round(v.originX + t.tx * TILE * k);
        const y0 = Math.round(v.originY + t.ty * TILE * k);
        const x1 = Math.round(v.originX + (t.tx + 1) * TILE * k);
        const y1 = Math.round(v.originY + (t.ty + 1) * TILE * k);
        ctx.drawImage(t.canvas, x0, y0, x1 - x0, y1 - y0);
        t.lastUsed = this.frame;
        drawn.add(t);
      }
      ctx.restore();
      if (this.sets.includes(set)) this.setUsed.set(set, v.frame);
      return true;
    }
    return false;
  }

  private enqueueIfNeeded(scheduler: Scheduler, layerKey: string, set: TileSet, tx: number, ty: number, priority: number) {
    if (!this.occupied(set.scale, tx, ty)) {
      if (set.get(tx, ty)) this.dropTile(set, tx, ty);
      return;
    }
    const t = set.get(tx, ty);
    if (t && t.state === "ready") return;
    this.enqueue(scheduler, layerKey, set, tx, ty, priority);
  }

  private enqueue(scheduler: Scheduler, layerKey: string, set: TileSet, tx: number, ty: number, priority: number) {
    const key = `${layerKey}|${set.pinned ? "o" : ""}${scaleKey(set.scale)}|${tx},${ty};`;
    if (scheduler.has(key)) return;
    scheduler.add(this.job(key, set, tx, ty, priority));
  }

  private dirtySince(v0: number, r: Bounds): boolean {
    if (this.version === v0) return false;
    if (v0 < this.logFloor) return true;
    return this.log.some((e) => e.v > v0 && intersects(e.r, r));
  }

  private job(key: string, set: TileSet, tx: number, ty: number, priority: number): Job {
    const r = tileBounds(tx, ty, set.scale);
    let units: ElementLike[][] | null = null;
    let started = -1;
    let generation = -1;
    let canvas: HTMLCanvasElement | null = null;
    let i = 0;
    return {
      key,
      priority,
      step: (deadline: number) => {
        if (!this.hasSet(set)) {
          if (canvas) this.cache.release(canvas);
          return true;
        }
        if (!units || generation !== this.generation || this.dirtySince(started, r)) {
          units = this.unitsIn(r);
          started = this.version;
          generation = this.generation;
          i = 0;
          if (canvas) canvas.getContext("2d")!.clearRect(0, 0, TILE, TILE);
        }
        if (!units.length) {
          if (canvas) this.cache.release(canvas);
          this.dropTile(set, tx, ty);
          return true;
        }
        canvas ??= this.cache.alloc();
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(set.scale, 0, 0, set.scale, -tx * TILE, -ty * TILE);
        while (i < units.length) {
          this.render(ctx, units[i++]);
          if (this.now() >= deadline) break;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (i < units.length) return false;
        const old = set.get(tx, ty);
        if (old) {
          this.cache.release(old.canvas);
          old.canvas = canvas;
          old.state = "ready";
          old.lastUsed = this.frame;
        } else {
          set.set({ tx, ty, canvas, state: "ready", lastUsed: this.frame });
        }
        canvas = null;
        return true;
      },
    };
  }
}
