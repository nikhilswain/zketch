import type { ShapeElementLike, TextElementLike } from "../types";
import { bindableBox, outlinePoint, toLocal, toWorld, type Vec } from "./outline";
import type { Measure } from "./textLayout";

export type Side = "top" | "right" | "bottom" | "left";
export type Axis = "h" | "v";

type Bindable = ShapeElementLike | TextElementLike;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function validAnchor(anchor: unknown): anchor is Vec {
  const a = anchor as Vec | null | undefined;
  return !!a && Number.isFinite(a.x) && Number.isFinite(a.y);
}

export function anchorFor(el: Bindable, p: Vec, measure: Measure): Vec {
  const box = bindableBox(el, measure);
  const local = toLocal(box, p);
  if (Math.hypot(local.x, local.y) < 1e-6) return { x: 1, y: 0.5 };
  const edge = toLocal(box, outlinePoint(el, p, 0, measure));
  const w = Math.max(0.5, box.width);
  const h = Math.max(0.5, box.height);
  return { x: clamp01(edge.x / w + 0.5), y: clamp01(edge.y / h + 0.5) };
}

export function anchorPoint(el: Bindable, anchor: Vec, gap: number, measure: Measure): Vec {
  const box = bindableBox(el, measure);
  const target = toWorld(box, { x: (clamp01(anchor.x) - 0.5) * box.width, y: (clamp01(anchor.y) - 0.5) * box.height });
  return outlinePoint(el, target, gap, measure);
}

export function anchorSide(anchor: Vec): Side {
  const dx = anchor.x - 0.5;
  const dy = anchor.y - 0.5;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

export const SIDE_ANCHORS: Record<Side, Vec> = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
};

export const SIDE_VECTORS: Record<Side, Vec> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const sideAxis = (side: Side): Axis => (side === "left" || side === "right" ? "h" : "v");

export function sideOfVector(x: number, y: number): Side {
  if (Math.abs(x) + 1e-9 >= Math.abs(y)) return x < 0 ? "left" : "right";
  return y < 0 ? "top" : "bottom";
}

export function worldSide(rotationDeg: number, side: Side): Side {
  const a = ((rotationDeg || 0) * Math.PI) / 180;
  const v = SIDE_VECTORS[side];
  return sideOfVector(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a));
}

export function pinsAt(el: Bindable, p: Vec, zoom: number, measure: Measure): boolean {
  const box = bindableBox(el, measure);
  const local = toLocal(box, p);
  const inset = Math.min(box.width / 2 - Math.abs(local.x), box.height / 2 - Math.abs(local.y));
  const band = Math.min(Math.min(box.width, box.height) / 4, 24 / Math.max(zoom, 1e-6));
  return inset < band;
}
