import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
  getSnapshot,
  isStateTreeNode,
} from "mobx-state-tree";
import { Stroke } from "./SharedModels";

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
export const Layer = types
  .model("Layer", {
    ...BaseLayerProps,
    type: types.optional(LayerType, "stroke"), // Discriminator with default for backward compatibility
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

export interface ILayer extends Instance<typeof Layer> {}
export interface ILayerSnapshot extends SnapshotOut<typeof Layer> {}
export interface ILayerSnapshotIn extends SnapshotIn<typeof Layer> {}

// Utility to create a new layer with a unique ID
export function createLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createDefaultLayer(
  name: string = "Layer 1"
): SnapshotIn<typeof Layer> {
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

export default Layer;
