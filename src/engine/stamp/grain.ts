import { createCanvas } from "../render/canvasFactory";
import { seededRandom } from "../render/seededRandom";

const NOISE_SIZE = 256;

const sources = new Map<string, Float32Array>();
const sourceSizes = new Map<string, number>();
const masks = new Map<string, HTMLCanvasElement>();
let loader: ((id: string) => void) | null = null;

export function setGrainLoader(next: ((id: string) => void) | null) {
  loader = next;
}

function proceduralPaper(size: number): Float32Array {
  const out = new Float32Array(size * size);
  const octaves = [
    { cells: 64, weight: 0.5 },
    { cells: 32, weight: 0.3 },
    { cells: 16, weight: 0.2 },
  ];
  for (const { cells, weight } of octaves) {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = seededRandom(i * 12.9898 + cells * 78.233);
    }
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / step;
      const y0 = Math.floor(gy) % cells;
      const y1 = (y0 + 1) % cells;
      const ty = gy - Math.floor(gy);
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const x0 = Math.floor(gx) % cells;
        const x1 = (x0 + 1) % cells;
        const tx = gx - Math.floor(gx);
        const sx = tx * tx * (3 - 2 * tx);
        const top = grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
        const bottom = grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
        out[y * size + x] += (top * (1 - sy) + bottom * sy) * weight;
      }
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

export function registerGrain(id: string, values: Float32Array, size: number) {
  sources.set(id, values);
  sourceSizes.set(id, size);
  for (const key of [...masks.keys()]) {
    if (key.startsWith(id + "|")) masks.delete(key);
  }
}

function grainSource(id: string) {
  const values = sources.get(id);
  if (values) return { values, size: sourceSizes.get(id) ?? NOISE_SIZE };
  if (id !== "paper-noise") loader?.(id);
  let noise = sources.get("paper-noise");
  if (!noise) {
    noise = proceduralPaper(NOISE_SIZE);
    sources.set("paper-noise", noise);
    sourceSizes.set("paper-noise", NOISE_SIZE);
  }
  return { values: noise, size: NOISE_SIZE };
}

export function getGrainMask(id: string, depth: number): HTMLCanvasElement {
  const bucket = Math.round(Math.max(0, Math.min(1, depth)) * 20);
  const key = `${id}|${bucket}`;
  const hit = masks.get(key);
  if (hit) return hit;
  const { values, size } = grainSource(id);
  const d = bucket / 20;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const o = i * 4;
    image.data[o] = 255;
    image.data[o + 1] = 255;
    image.data[o + 2] = 255;
    image.data[o + 3] = Math.round(255 * (1 - d * (1 - values[i])));
  }
  ctx.putImageData(image, 0, 0);
  masks.set(key, canvas);
  return canvas;
}
