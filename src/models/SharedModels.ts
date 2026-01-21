import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
} from "mobx-state-tree";

// Base Point model - shared across all models
export const Point = types.model("Point", {
  x: types.number,
  y: types.number,
  pressure: types.optional(types.number, 1),
});

// Base Stroke model - shared across all models
export const Stroke = types.model("Stroke", {
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
  // Brush settings stored per-stroke for correct rendering
  thinning: types.optional(types.number, 0.5),
  smoothing: types.optional(types.number, 0.5),
  streamline: types.optional(types.number, 0.5),
  taperStart: types.optional(types.number, 30),
  taperEnd: types.optional(types.number, 30),
});

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
