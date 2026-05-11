import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
} from "mobx-state-tree";

export type ShapeKind = "rectangle" | "circle" | "diamond" | "triangle";

// Shape element — lives inside a DrawLayer's elements array, not a layer itself.
export const ShapeElement = types
  .model("ShapeElement", {
    id: types.identifier,
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
    opacity: types.optional(types.number, 1),
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
    setPosition(x: number, y: number) {
      self.x = x;
      self.y = y;
    },
    move(dx: number, dy: number) {
      self.x += dx;
      self.y += dy;
    },
    setSize(width: number, height: number, _maintainAspect?: boolean) {
      self.width = Math.max(10, width);
      self.height = Math.max(10, height);
    },
    setRotation(deg: number) {
      self.rotation = ((deg % 360) + 360) % 360;
    },
    rotate(d: number) {
      self.rotation = (((self.rotation + d) % 360) + 360) % 360;
    },
    setStrokeColor(c: string) {
      self.strokeColor = c;
    },
    setStrokeWidth(w: number) {
      self.strokeWidth = Math.max(1, Math.min(50, w));
    },
    setCornerRadius(r: number) {
      self.cornerRadius = Math.max(0, r);
    },
    setFillColor(c: string | null) {
      self.fillColor = c;
    },
    setShapeType(t: ShapeKind) {
      self.shapeType = t;
    },
    setOpacity(o: number) {
      self.opacity = Math.max(0, Math.min(1, o));
    },
  }));

export interface IShapeElement extends Instance<typeof ShapeElement> {}
export interface IShapeElementSnapshot extends SnapshotOut<typeof ShapeElement> {}
export interface IShapeElementSnapshotIn extends SnapshotIn<typeof ShapeElement> {}

export function createShapeElementId(): string {
  return `shape_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createShapeElement(
  shapeType: ShapeKind,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: {
    strokeColor?: string;
    strokeWidth?: number;
    cornerRadius?: number;
    opacity?: number;
    fillColor?: string | null;
  },
): SnapshotIn<typeof ShapeElement> {
  return {
    id: createShapeElementId(),
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
    opacity: options?.opacity ?? 1,
  };
}

export default ShapeElement;
