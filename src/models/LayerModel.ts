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
import { ShapeElement } from "./ShapeLayerModel";

// Layer-level discriminator (image stays its own layer; everything else is a draw layer)
export const LayerType = types.enumeration("LayerType", ["draw", "image"]);

// Element union — strokes and shapes can both live inside a draw layer's elements array.
// Stroke has `points`/`brushStyle`; ShapeElement has `shapeType`. Dispatch on shapeType presence.
export const Element = types.union(
  {
    dispatcher: (snapshot: any) => {
      if (snapshot && typeof snapshot === "object" && "shapeType" in snapshot) {
        return ShapeElement;
      }
      return Stroke;
    },
  },
  Stroke,
  ShapeElement,
);

export type IElement = Instance<typeof Element>;
export type IElementSnapshot = SnapshotOut<typeof Element>;
export type IElementSnapshotIn = SnapshotIn<typeof Element>;

const BaseLayerProps = {
  id: types.identifier,
  name: types.string,
  visible: types.optional(types.boolean, true),
  locked: types.optional(types.boolean, false),
  opacity: types.optional(types.number, 1),
};

// Draw layer — holds an ordered mix of stroke and shape elements.
export const DrawLayer = types
  .model("DrawLayer", {
    ...BaseLayerProps,
    type: types.optional(types.literal("draw"), "draw"),
    elements: types.optional(types.array(Element), []),
  })
  .views((self) => ({
    get isEmpty() {
      return self.elements.length === 0;
    },
    get strokeElements() {
      return self.elements.filter(
        (e: any) => !("shapeType" in e),
      ) as Instance<typeof Stroke>[];
    },
    get shapeElements() {
      return self.elements.filter(
        (e: any) => "shapeType" in e,
      ) as Instance<typeof ShapeElement>[];
    },
    findElement(elementId: string) {
      return self.elements.find((e: any) => e.id === elementId) || null;
    },
  }))
  .views((self) => ({
    get strokeCount() {
      return self.strokeElements.length;
    },
    get shapeCount() {
      return self.shapeElements.length;
    },
  }))
  .actions((self) => ({
    setName(name: string) {
      self.name = name;
    },
    setVisible(v: boolean) {
      self.visible = v;
    },
    toggleVisible() {
      self.visible = !self.visible;
    },
    setLocked(l: boolean) {
      self.locked = l;
    },
    toggleLocked() {
      self.locked = !self.locked;
    },
    setOpacity(o: number) {
      self.opacity = Math.max(0, Math.min(1, o));
    },
    addStroke(strokeData: SnapshotIn<typeof Stroke> | any) {
      if (self.locked) return;
      if (isStateTreeNode(strokeData)) {
        const snapshot = getSnapshot(strokeData as any);
        self.elements.push(Stroke.create(snapshot as SnapshotIn<typeof Stroke>));
      } else {
        self.elements.push(
          Stroke.create(strokeData as SnapshotIn<typeof Stroke>),
        );
      }
    },
    addShape(shapeData: SnapshotIn<typeof ShapeElement>) {
      if (self.locked) return;
      const created = ShapeElement.create(shapeData);
      self.elements.push(created);
      return created.id;
    },
    removeElement(elementId: string) {
      if (self.locked) return;
      const idx = self.elements.findIndex((e: any) => e.id === elementId);
      if (idx !== -1) self.elements.splice(idx, 1);
    },
    clearElements() {
      if (self.locked) return;
      self.elements.clear();
    },
    // Used by "Clear Layer" — removes only stroke elements, keeps shapes.
    clearStrokes() {
      if (self.locked) return;
      const remaining = self.elements
        .filter((e: any) => "shapeType" in e)
        .map((e: any) => getSnapshot(e));
      self.elements.clear();
      remaining.forEach((s: any) => self.elements.push(ShapeElement.create(s)));
    },
  }));

/**
 * Union type for all layer types — DrawLayer (mixed elements) or ImageLayer.
 */
export const Layer = types.union(
  {
    dispatcher: (snapshot: any) => {
      if (snapshot?.type === "image") return ImageLayer;
      return DrawLayer;
    },
  },
  DrawLayer,
  ImageLayer,
);

// Type exports
export interface IDrawLayer extends Instance<typeof DrawLayer> {}
export interface IDrawLayerSnapshot extends SnapshotOut<typeof DrawLayer> {}
export interface IDrawLayerSnapshotIn extends SnapshotIn<typeof DrawLayer> {}

export type ILayer = Instance<typeof Layer>;
export type ILayerSnapshot = SnapshotOut<typeof Layer>;
export type ILayerSnapshotIn = SnapshotIn<typeof Layer>;

// Legacy alias — many call sites still import IStrokeLayer expecting "the stroke-bearing layer".
// In the new model that's any DrawLayer.
export type IStrokeLayer = IDrawLayer;

export function createLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createDefaultLayer(
  name: string = "Layer 1",
): SnapshotIn<typeof DrawLayer> {
  return {
    id: createLayerId(),
    name,
    type: "draw",
    elements: [],
    visible: true,
    locked: false,
    opacity: 1,
  };
}

export type LayerTypeValue = "draw" | "image";

// Re-export ImageLayer + ShapeElement utilities
export {
  createImageLayer,
  createBlobId,
  createImageLayerId,
} from "./ImageLayerModel";

export {
  createShapeElement,
  ShapeElement,
  type ShapeKind,
  type IShapeElement,
} from "./ShapeLayerModel";

export default Layer;
