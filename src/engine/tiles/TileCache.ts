import { createCanvas } from "../render/canvasFactory";
import { TILE, intersects, tileBounds, type Bounds } from "./tileMath";

export type TileState = "ready" | "dirty" | "stale";

export interface Tile {
  tx: number;
  ty: number;
  canvas: HTMLCanvasElement;
  state: TileState;
  lastUsed: number;
}

const TILE_BYTES = TILE * TILE * 4;
const POOL_CAP = 16;

const key = (tx: number, ty: number) => `${tx},${ty}`;

export class TileSet {
  private map = new Map<string, Tile>();

  constructor(
    readonly scale: number,
    readonly pinned = false,
  ) {}

  get(tx: number, ty: number): Tile | undefined {
    return this.map.get(key(tx, ty));
  }

  set(tile: Tile): void {
    this.map.set(key(tile.tx, tile.ty), tile);
  }

  delete(tx: number, ty: number): Tile | undefined {
    const k = key(tx, ty);
    const tile = this.map.get(k);
    this.map.delete(k);
    return tile;
  }

  markDirty(r: Bounds): Tile[] {
    const hit: Tile[] = [];
    for (const tile of this.map.values()) {
      if (intersects(tileBounds(tile.tx, tile.ty, this.scale), r)) {
        tile.state = "dirty";
        hit.push(tile);
      }
    }
    return hit;
  }

  markAllStale(): void {
    for (const tile of this.map.values()) if (tile.state === "ready") tile.state = "stale";
  }

  tiles(): IterableIterator<Tile> {
    return this.map.values();
  }

  get size(): number {
    return this.map.size;
  }
}

export class TileCache {
  private sets = new Set<TileSet>();
  private pool: HTMLCanvasElement[] = [];

  constructor(private budgetBytes: number) {}

  setBudget(bytes: number): void {
    this.budgetBytes = bytes;
  }

  alloc(): HTMLCanvasElement {
    const c = this.pool.pop();
    if (c) {
      c.getContext("2d")!.clearRect(0, 0, TILE, TILE);
      return c;
    }
    return createCanvas(TILE, TILE);
  }

  release(c: HTMLCanvasElement): void {
    if (this.pool.length < POOL_CAP) this.pool.push(c);
  }

  add(set: TileSet): void {
    this.sets.add(set);
  }

  remove(set: TileSet): void {
    this.sets.delete(set);
    for (const tile of set.tiles()) this.release(tile.canvas);
  }

  bytes(): number {
    let n = 0;
    for (const set of this.sets) n += set.size;
    return n * TILE_BYTES;
  }

  evict(protect: Set<Tile>): void {
    let bytes = this.bytes();
    if (bytes <= this.budgetBytes) return;
    const candidates: { set: TileSet; tile: Tile }[] = [];
    for (const set of this.sets) {
      if (set.pinned) continue;
      for (const tile of set.tiles()) if (!protect.has(tile)) candidates.push({ set, tile });
    }
    candidates.sort((a, b) => a.tile.lastUsed - b.tile.lastUsed);
    for (const { set, tile } of candidates) {
      if (bytes <= this.budgetBytes) break;
      set.delete(tile.tx, tile.ty);
      this.release(tile.canvas);
      bytes -= TILE_BYTES;
    }
  }
}
