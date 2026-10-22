import type { ILayerData } from "../models/VaultModel";
import { elementKind } from "../engine/types";
import type { Replay } from "./replay";

export type TimeSlice = { start: number; end: number; color: string };

export type StripBox = { x: number; w: number };

export const NEUTRAL_SLICE = "#8a8377";
export const EMPTY_SLICE = "#d9d6cf";
export const MAX_SLICES = 72;

function isColor(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "" && v !== "transparent" && v !== "none";
}

function elementAt(layers: ILayerData[], layer: number, element: number): any {
  const l = layers[layer] as any;
  if (!l) return null;
  const list = l.type === "draw" ? l.elements : l.type === "stroke" ? l.strokes : null;
  return list?.[element] ?? null;
}

export function elementColor(el: any): string {
  if (!el) return NEUTRAL_SLICE;
  const kind = elementKind(el);
  if (kind === "stroke") {
    return el.brushStyle !== "eraser" && isColor(el.color) ? el.color : NEUTRAL_SLICE;
  }
  if (kind === "text") return isColor(el.color) ? el.color : NEUTRAL_SLICE;
  return isColor(el.strokeColor) ? el.strokeColor : NEUTRAL_SLICE;
}

function boundaries(replay: Replay, max: number): number[] {
  const { items, total } = replay;
  if (items.length <= max) {
    const starts = [...new Set(items.map((i) => i.start))].filter((s) => s < total).sort((a, b) => a - b);
    return [...starts, total];
  }
  return Array.from({ length: max + 1 }, (_, i) => (i === max ? total : (total * i) / max));
}

export function timeSlices(replay: Replay, layers: ILayerData[], max = MAX_SLICES): TimeSlice[] {
  const { items, total } = replay;
  if (items.length === 0 || !(total > 0) || max < 1) return [];
  const colors = items.map((i) => elementColor(elementAt(layers, i.layer, i.element)));
  const edges = boundaries(replay, max);
  const out: TimeSlice[] = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const start = edges[k];
    const end = edges[k + 1];
    const cover = new Map<string, number>();
    items.forEach((item, i) => {
      const overlap = Math.min(end, item.end) - Math.max(start, item.start);
      if (overlap > 0) cover.set(colors[i], (cover.get(colors[i]) ?? 0) + overlap);
    });
    let color = EMPTY_SLICE;
    let best = 0;
    for (const [c, v] of cover) {
      if (v > best) {
        best = v;
        color = c;
      }
    }
    out.push({ start, end, color });
  }
  return out;
}

export function stripLayout(slices: TimeSlice[], width: number, gap: number): StripBox[] {
  const n = slices.length;
  if (n === 0 || width <= 0) return [];
  const total = slices[n - 1].end - slices[0].start;
  const floor = total / (n * 3);
  const weights = slices.map((s) => Math.max(s.end - s.start, floor));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const room = Math.max(0, width - gap * (n - 1));
  const boxes: StripBox[] = [];
  let x = 0;
  weights.forEach((w) => {
    const size = (room * w) / sum;
    boxes.push({ x, w: size });
    x += size + gap;
  });
  return boxes;
}

export function sliceAt(boxes: StripBox[], x: number): number {
  if (boxes.length === 0) return -1;
  for (let i = 0; i < boxes.length; i++) {
    const next = boxes[i + 1];
    const edge = next ? (boxes[i].x + boxes[i].w + next.x) / 2 : Infinity;
    if (x < edge) return i;
  }
  return boxes.length - 1;
}
