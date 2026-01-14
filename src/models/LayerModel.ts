import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
  getSnapshot,
  isStateTreeNode,
} from "mobx-state-tree";
import { Stroke } from "./SharedModels";
import { ImageLayer } from "./ImageLayerModel";

// Layer type discriminator
export const LayerType = types.enumeration("LayerType", ["stroke", "image"]);

// Base layer properties shared by all layer types
const BaseLayerProps = {
  id: types.identifier,
  name: types.string,
  visible: types.optional(types.boolean, true),
  locked: types.optional(types.boolean, false),
  opacity: types.optional(types.number, 1), // 0-1
};

// Stroke Layer - contains drawing strokes
export const StrokeLayer = types
  .model("StrokeLayer", {
    ...BaseLayerProps,
    type: types.optional(types.literal("stroke"), "stroke"),
    strokes: types.optional(types.array(Stroke), []),
  })
  .views((self) => ({
    get isEmpty() {
      return self.strokes.length === 0;
    },
    get strokeCount() {
      return self.strokes.length;
    },
  }))
  .actions((self) => ({
    setName(name: string) {
      self.name = name;
    },
    setVisible(visible: boolean) {
      self.visible = visible;
    },
    toggleVisible() {
      self.visible = !self.visible;
    },
    setLocked(locked: boolean) {
      self.locked = locked;
    },
    toggleLocked() {
      self.locked = !self.locked;
    },
    setOpacity(opacity: number) {
      self.opacity = Math.max(0, Math.min(1, opacity));
    },
    addStroke(strokeData: SnapshotIn<typeof Stroke> | any) {
      if (self.locked) return; // Don't add strokes to locked layers

      if (isStateTreeNode(strokeData)) {
        const snapshot = getSnapshot(strokeData as any);
        self.strokes.push(Stroke.create(snapshot as SnapshotIn<typeof Stroke>));
      } else {
        self.strokes.push(
          Stroke.create(strokeData as SnapshotIn<typeof Stroke>)
        );
      }
    },
    removeStroke(strokeId: string) {
      if (self.locked) return;
      const index = self.strokes.findIndex((s) => s.id === strokeId);
      if (index !== -1) {
        self.strokes.splice(index, 1);
      }
    },
    clearStrokes() {
      if (self.locked) return;
      self.strokes.clear();
    },
    replaceStrokes(strokes: SnapshotIn<typeof Stroke>[]) {
      if (self.locked) return;
      self.strokes.clear();
      strokes.forEach((strokeData) => {
        if (isStateTreeNode(strokeData)) {
          const snapshot = getSnapshot(strokeData as any);
          self.strokes.push(
            Stroke.create(snapshot as SnapshotIn<typeof Stroke>)
          );
        } else {
          self.strokes.push(
            Stroke.create(strokeData as SnapshotIn<typeof Stroke>)
          );
        }
      });
    },
  }));

/**
 * Union type for all layer types
 * Uses a dispatcher to determine which model to use based on the 'type' property
 */
export const Layer = types.union(
  {
    dispatcher: (snapshot: any) => {
      if (snapshot?.type === "image") {
        return ImageLayer;
      }
      // Default to StrokeLayer for backward compatibility
      return StrokeLayer;
    },
  },
  StrokeLayer,
  ImageLayer
);

// Type exports for StrokeLayer
export interface IStrokeLayer extends Instance<typeof StrokeLayer> {}
export interface IStrokeLayerSnapshot extends SnapshotOut<typeof StrokeLayer> {}
export interface IStrokeLayerSnapshotIn
  extends SnapshotIn<typeof StrokeLayer> {}

// Union layer type exports
export type ILayer = Instance<typeof Layer>;
export type ILayerSnapshot = SnapshotOut<typeof Layer>;
export type ILayerSnapshotIn = SnapshotIn<typeof Layer>;

// Utility to create a new layer with a unique ID
export function createLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createDefaultLayer(
  name: string = "Layer 1"
): SnapshotIn<typeof StrokeLayer> {
  return {
    id: createLayerId(),
    name,
    type: "stroke",
    strokes: [],
    visible: true,
    locked: false,
    opacity: 1,
  };
}

// Type exports
export type LayerTypeValue = "stroke" | "image";

// Re-export ImageLayer utilities
export {
  createImageLayer,
  createBlobId,
  createImageLayerId,
} from "./ImageLayerModel";

export default Layer;
