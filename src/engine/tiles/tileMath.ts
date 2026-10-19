import type { Bounds } from "../render/elementBounds";

export type { Bounds };

export const TILE = 512;

export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function scaleKey(s: number): string {
  return s.toFixed(6);
}

export function tileRange(r: Bounds, s: number): TileRange {
  const k = s / TILE;
  return {
    x0: Math.floor(r.minX * k),
    y0: Math.floor(r.minY * k),
    x1: Math.max(Math.floor(r.minX * k), Math.ceil(r.maxX * k) - 1),
    y1: Math.max(Math.floor(r.minY * k), Math.ceil(r.maxY * k) - 1),
  };
}

export function tileBounds(tx: number, ty: number, s: number): Bounds {
  const w = TILE / s;
  return { minX: tx * w, minY: ty * w, maxX: (tx + 1) * w, maxY: (ty + 1) * w };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function union(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function pad(b: Bounds, p: number): Bounds {
  return { minX: b.minX - p, minY: b.minY - p, maxX: b.maxX + p, maxY: b.maxY + p };
}
