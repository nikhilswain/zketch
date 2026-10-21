import type { ILayerData } from "../models/VaultModel";
import { elementKind } from "../engine/types";

export type ReplayItem = {
  layer: number;
  element: number;
  start: number;
  end: number;
};

export type Replay = { items: ReplayItem[]; total: number };

export type SpeedMode = "auto" | "real" | "fast";

const STROKE_DEFAULT_MS = 500;
const SKETCH_MS = 300;
const TARGET_MS = 15000;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function layerElements(layer: ILayerData): any[] | null {
  if (!layer.visible) return null;
  if (layer.type === "draw") return layer.elements as any[];
  if ((layer as any).type === "stroke") return (layer as any).strokes ?? [];
  return null;
}

function timedStart(el: any): number | null {
  if (elementKind(el) === "stroke") return num(el.startTime) ?? num(el.timestamp);
  return num(el.createdAt);
}

function ownLength(el: any): number {
  if (elementKind(el) === "stroke") return num(el.duration) ?? STROKE_DEFAULT_MS;
  return SKETCH_MS;
}

export function buildReplay(layers: ILayerData[], maxGap = 500): Replay {
  const lists = layers.map(layerElements);

  let earliest: number | null = null;
  for (const list of lists) {
    if (!list) continue;
    for (const el of list) {
      const s = timedStart(el);
      if (s !== null && (earliest === null || s < earliest)) earliest = s;
    }
  }

  const raw: ReplayItem[] = [];
  lists.forEach((list, layer) => {
    if (!list) return;
    const byId = new Map<string, ReplayItem>();
    let prevEnd: number | null = null;
    list.forEach((el, element) => {
      const kind = elementKind(el);
      const container =
        kind === "text" && el.containerId ? byId.get(el.containerId) : undefined;
      let start: number;
      let end: number;
      if (container) {
        start = container.start;
        end = container.end;
      } else {
        start = timedStart(el) ?? prevEnd ?? earliest ?? 0;
        end = start + ownLength(el);
      }
      const item = { layer, element, start, end };
      raw.push(item);
      if (el.id !== undefined) byId.set(String(el.id), item);
      prevEnd = end;
    });
  });

  if (raw.length === 0) return { items: [], total: 0 };

  raw.sort((a, b) => a.start - b.start || a.layer - b.layer || a.element - b.element);

  const base = raw[0].start;
  let removed = 0;
  let lastEnd = base;
  let total = -Infinity;
  const items = raw.map((r) => {
    if (maxGap > 0) {
      const gap = r.start - lastEnd;
      if (gap > maxGap) removed += gap - maxGap;
    }
    lastEnd = Math.max(lastEnd, r.end);
    const end = r.end - base - removed;
    total = Math.max(total, end);
    return {
      layer: r.layer,
      element: r.element,
      start: r.start - base - removed,
      end,
    };
  });

  return { items, total };
}

export function progressAt(replay: Replay, t: number): Map<string, number> {
  const out = new Map<string, number>();
  const done = t >= replay.total;
  for (const item of replay.items) {
    const key = `${item.layer}:${item.element}`;
    if (done) {
      out.set(key, 1);
      continue;
    }
    if (t < item.start) continue;
    const len = item.end - item.start;
    out.set(key, len <= 0 ? 1 : Math.min(1, (t - item.start) / len));
  }
  return out;
}

export function partialStroke<T extends { points: unknown[] }>(
  stroke: T,
  p: number,
): T {
  const count = Math.max(1, Math.floor(stroke.points.length * p));
  return { ...stroke, points: stroke.points.slice(0, count) };
}

export function autoSpeed(total: number): number {
  return Math.max(1, total / TARGET_MS);
}

export function nextSpeedMode(m: SpeedMode): SpeedMode {
  return m === "auto" ? "real" : m === "real" ? "fast" : "auto";
}

export function speedFor(m: SpeedMode, total: number): number {
  if (m === "real") return 1;
  if (m === "fast") return 2 * autoSpeed(total);
  return autoSpeed(total);
}
