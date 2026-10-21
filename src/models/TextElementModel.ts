import { types, type Instance, type SnapshotIn } from "mobx-state-tree";
import { layoutText } from "@/engine/geometry/textLayout";
import { measureText } from "@/engine/render/fonts";

export type FontFamilyId = "hand" | "sans" | "mono";
export type TextAlign = "left" | "center" | "right";

export const TextElement = types
  .model("TextElement", {
    id: types.identifier,
    kind: types.literal("text"),
    x: types.optional(types.number, 0),
    y: types.optional(types.number, 0),
    text: types.optional(types.string, ""),
    fontFamily: types.optional(types.enumeration("FontFamilyId", ["hand", "sans", "mono"]), "hand"),
    fontSize: types.optional(types.number, 24),
    align: types.optional(types.enumeration("TextAlign", ["left", "center", "right"]), "left"),
    color: types.optional(types.string, "#000000"),
    opacity: types.optional(types.number, 1),
    rotation: types.optional(types.number, 0),
    containerId: types.optional(types.maybeNull(types.string), null),
    createdAt: types.maybe(types.number),
  })
  .views((self) => ({
    get layout() {
      return layoutText(self.text, self.fontSize, self.fontFamily as FontFamilyId, null, measureText);
    },
  }))
  .views((self) => ({
    get width() {
      return self.layout.width;
    },
    get height() {
      return self.layout.height;
    },
  }))
  .actions((self) => ({
    setText(t: string) {
      self.text = t;
    },
    setPosition(x: number, y: number) {
      self.x = x;
      self.y = y;
    },
    move(dx: number, dy: number) {
      self.x += dx;
      self.y += dy;
    },
    setFontSize(size: number) {
      self.fontSize = Math.max(4, Math.min(512, size));
    },
    setFontFamily(f: FontFamilyId) {
      self.fontFamily = f;
    },
    setAlign(a: TextAlign) {
      self.align = a;
    },
    setColor(c: string) {
      self.color = c;
    },
    setOpacity(o: number) {
      self.opacity = Math.max(0, Math.min(1, o));
    },
    setRotation(deg: number) {
      self.rotation = ((deg % 360) + 360) % 360;
    },
    setSize(_width: number, height: number) {
      const current = self.layout.height;
      if (current > 0 && height > 0) self.fontSize = Math.max(4, Math.min(512, (self.fontSize * height) / current));
    },
  }));

export interface ITextElement extends Instance<typeof TextElement> {}

export function createTextElement(
  x: number,
  y: number,
  text: string,
  options?: {
    fontFamily?: FontFamilyId;
    fontSize?: number;
    align?: TextAlign;
    color?: string;
    opacity?: number;
    containerId?: string | null;
  },
): SnapshotIn<typeof TextElement> {
  return {
    id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    kind: "text",
    x,
    y,
    text,
    fontFamily: options?.fontFamily ?? "hand",
    fontSize: options?.fontSize ?? 24,
    align: options?.align ?? "left",
    color: options?.color ?? "#000000",
    opacity: options?.opacity ?? 1,
    rotation: 0,
    containerId: options?.containerId ?? null,
  };
}

export default TextElement;
