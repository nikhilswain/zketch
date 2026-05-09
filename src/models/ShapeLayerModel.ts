import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
} from "mobx-state-tree";

export type ShapeKind = "rectangle" | "circle" | "diamond" | "triangle";

export const ShapeLayer = types
  .model("ShapeLayer", {
    id: types.identifier,
    name: types.string,
    type: types.literal("shape"),
    visible: types.optional(types.boolean, true),
    locked: types.optional(types.boolean, false),
    opacity: types.optional(types.number, 1),

    shapeType: types.enumeration("ShapeKind", [
      "rectangle",
      "circle",
      "diamond",
      "triangle",
    ]),

    x: types.optional(types.number, 0),
    y: types.optional(types.number, 0),
    width: types.number,
    height: types.number,
    rotation: types.optional(types.number, 0),

    strokeColor: types.optional(types.string, "#000000"),
    strokeWidth: types.optional(types.number, 4),
    cornerRadius: types.optional(types.number, 8),
    fillColor: types.optional(types.maybeNull(types.string), null),
  })
  .views((self) => ({
    get bounds() {
      return {
        left: self.x,
        top: self.y,
        right: self.x + self.width,
        bottom: self.y + self.height,
        width: self.width,
        height: self.height,
      };
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
    setPosition(x: number, y: number) {
      if (self.locked) return;
      self.x = x;
      self.y = y;
    },
    move(dx: number, dy: number) {
      if (self.locked) return;
      self.x += dx;
      self.y += dy;
    },
    setSize(width: number, height: number, _maintainAspect?: boolean) {
      if (self.locked) return;
      self.width = Math.max(10, width);
      self.height = Math.max(10, height);
    },
    setRotation(deg: number) {
      if (self.locked) return;
      self.rotation = ((deg % 360) + 360) % 360;
    },
    rotate(d: number) {
      if (self.locked) return;
      self.rotation = (((self.rotation + d) % 360) + 360) % 360;
    },
    setStrokeColor(c: string) {
      if (self.locked) return;
      self.strokeColor = c;
    },
    setStrokeWidth(w: number) {
      if (self.locked) return;
      self.strokeWidth = Math.max(1, Math.min(50, w));
    },
    setCornerRadius(r: number) {
      if (self.locked) return;
      self.cornerRadius = Math.max(0, r);
    },
    setFillColor(c: string | null) {
      if (self.locked) return;
      self.fillColor = c;
    },
    setShapeType(t: ShapeKind) {
      if (self.locked) return;
      self.shapeType = t;
    },
  }));

export interface IShapeLayer extends Instance<typeof ShapeLayer> {}
export interface IShapeLayerSnapshot extends SnapshotOut<typeof ShapeLayer> {}
export interface IShapeLayerSnapshotIn extends SnapshotIn<typeof ShapeLayer> {}

export function createShapeLayerId(): string {
  return `shape_layer_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  circle: "Circle",
  diamond: "Diamond",
  triangle: "Triangle",
};

export function createShapeLayer(
  shapeType: ShapeKind,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    name?: string;
    strokeColor?: string;
    strokeWidth?: number;
    cornerRadius?: number;
    opacity?: number;
    fillColor?: string | null;
  },
): SnapshotIn<typeof ShapeLayer> {
  return {
    id: createShapeLayerId(),
    name: options?.name || SHAPE_LABELS[shapeType],
    type: "shape",
    visible: true,
    locked: false,
    opacity: options?.opacity ?? 1,
    shapeType,
    x,
    y,
    width: Math.max(10, width),
    height: Math.max(10, height),
    rotation: 0,
    strokeColor: options?.strokeColor ?? "#000000",
    strokeWidth: options?.strokeWidth ?? 4,
    cornerRadius: options?.cornerRadius ?? 8,
    fillColor: options?.fillColor ?? null,
  };
}

export default ShapeLayer;
