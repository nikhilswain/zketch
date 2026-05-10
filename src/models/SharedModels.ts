import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
} from "mobx-state-tree";

// Base Point model - shared across all models
export const Point = types
  .model("Point", {
    x: types.number,
    y: types.number,
    pressure: types.optional(types.number, 1),
  })
  .actions((self) => ({
    translate(dx: number, dy: number) {
      self.x += dx;
      self.y += dy;
    },
    set(x: number, y: number) {
      self.x = x;
      self.y = y;
    },
  }));

// Base Stroke model - shared across all models
export const Stroke = types
  .model("Stroke", {
    id: types.identifier,
    points: types.array(Point),
    color: types.string,
    size: types.number,
    opacity: types.optional(types.number, 1),
    brushStyle: types.enumeration("BrushStyle", [
      "ink",
      "eraser",
      "spray",
      "texture",
    ]),
    timestamp: types.number,
    startTime: types.optional(types.maybeNull(types.number), null),
    duration: types.optional(types.maybeNull(types.number), null),
    thinning: types.optional(types.number, 0.5),
    smoothing: types.optional(types.number, 0.5),
    streamline: types.optional(types.number, 0.5),
    taperStart: types.optional(types.number, 30),
    taperEnd: types.optional(types.number, 30),
  })
  .actions((self) => ({
    setColor(c: string) {
      self.color = c;
    },
    setSize(s: number) {
      self.size = Math.max(1, s);
    },
    setOpacity(o: number) {
      self.opacity = Math.max(0, Math.min(1, o));
    },
    translate(dx: number, dy: number) {
      for (const p of self.points) p.translate(dx, dy);
    },
  }));

// Brush settings model
export const BrushSettings = types.model("BrushSettings", {
  thinning: types.optional(types.number, 0.5),
  smoothing: types.optional(types.number, 0.5),
  streamline: types.optional(types.number, 0.5),
  taperStart: types.optional(types.number, 30),
  taperEnd: types.optional(types.number, 30),
  easing: types.optional(types.string, "linear"),
  opacity: types.optional(types.number, 1),
});

// Export type aliases
export type BrushStyle = "ink" | "eraser" | "spray" | "texture";
export type BackgroundType = "white" | "transparent" | "grid";

export interface IStroke extends Instance<typeof Stroke> {}
export interface IPoint extends Instance<typeof Point> {}
export interface IStrokeSnapshot extends SnapshotOut<typeof Stroke> {}
export interface IStrokeSnapshotIn extends SnapshotIn<typeof Stroke> {}
