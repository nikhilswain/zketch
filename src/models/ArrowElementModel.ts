import { types, type Instance, type SnapshotIn } from "mobx-state-tree";
import { newSeed, type ElementLook } from "./ShapeLayerModel";

export type ArrowHead = "none" | "arrow" | "triangle" | "dot";
export type ArrowEnd = "start" | "end";
export type Vec = { x: number; y: number };
export type ArrowBinding = { elementId: string };

const HEADS = ["none", "arrow", "triangle", "dot"] as const;

export const ArrowElement = types
  .model("ArrowElement", {
    id: types.identifier,
    kind: types.literal("arrow"),
    start: types.frozen<Vec>({ x: 0, y: 0 }),
    end: types.frozen<Vec>({ x: 0, y: 0 }),
    bend: types.optional(types.number, 0),
    startBinding: types.optional(types.maybeNull(types.frozen<ArrowBinding>()), null),
    endBinding: types.optional(types.maybeNull(types.frozen<ArrowBinding>()), null),
    startHead: types.optional(types.enumeration("ArrowHead", [...HEADS]), "none"),
    endHead: types.optional(types.enumeration("ArrowHead", [...HEADS]), "arrow"),
    strokeColor: types.optional(types.string, "#000000"),
    strokeWidth: types.optional(types.number, 4),
    opacity: types.optional(types.number, 1),
    look: types.optional(types.enumeration("ElementLook", ["clean", "sketchy"]), "clean"),
    seed: types.optional(types.number, () => newSeed()),
  })
  .actions((self) => ({
    setEnds(start: Vec, end: Vec) {
      self.start = { x: start.x, y: start.y };
      self.end = { x: end.x, y: end.y };
    },
    setEnd(which: ArrowEnd, p: Vec) {
      if (which === "start") self.start = { x: p.x, y: p.y };
      else self.end = { x: p.x, y: p.y };
    },
    setBend(b: number) {
      self.bend = Number.isFinite(b) ? b : 0;
    },
    bind(which: ArrowEnd, elementId: string | null) {
      const value = elementId ? { elementId } : null;
      if (which === "start") self.startBinding = value;
      else self.endBinding = value;
    },
    move(dx: number, dy: number) {
      self.start = { x: self.start.x + dx, y: self.start.y + dy };
      self.end = { x: self.end.x + dx, y: self.end.y + dy };
    },
    setHeads(startHead: ArrowHead, endHead: ArrowHead) {
      self.startHead = startHead;
      self.endHead = endHead;
    },
    setStrokeColor(c: string) {
      self.strokeColor = c;
    },
    setStrokeWidth(w: number) {
      self.strokeWidth = Math.max(1, Math.min(50, w));
    },
    setOpacity(o: number) {
      self.opacity = Math.max(0, Math.min(1, o));
    },
    setLook(look: ElementLook) {
      self.look = look;
    },
  }));

export interface IArrowElement extends Instance<typeof ArrowElement> {}

export function createArrowElement(
  start: Vec,
  end: Vec,
  options?: {
    startBinding?: ArrowBinding | null;
    endBinding?: ArrowBinding | null;
    startHead?: ArrowHead;
    endHead?: ArrowHead;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
    look?: ElementLook;
  },
): SnapshotIn<typeof ArrowElement> {
  return {
    id: `arrow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    kind: "arrow",
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    bend: 0,
    startBinding: options?.startBinding ?? null,
    endBinding: options?.endBinding ?? null,
    startHead: options?.startHead ?? "none",
    endHead: options?.endHead ?? "arrow",
    strokeColor: options?.strokeColor ?? "#000000",
    strokeWidth: options?.strokeWidth ?? 4,
    opacity: options?.opacity ?? 1,
    look: options?.look ?? "clean",
    seed: newSeed(),
  };
}

export default ArrowElement;
