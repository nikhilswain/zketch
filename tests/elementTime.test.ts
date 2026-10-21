import { describe, expect, it } from "vitest";
import { getSnapshot } from "mobx-state-tree";
import { DrawLayer } from "@/models/LayerModel";
import { ShapeElement } from "@/models/ShapeLayerModel";
import { ArrowElement } from "@/models/ArrowElementModel";
import { TextElement } from "@/models/TextElementModel";
import { serializeLayers } from "@/utils/serializeLayers";

const shape = { id: "s", shapeType: "rectangle" as const, width: 20, height: 20 };
const arrow = { id: "a", kind: "arrow" as const };
const text = { id: "t", kind: "text" as const };

describe("element createdAt", () => {
  it("shape createdAt survives serializeLayers", () => {
    const layer = DrawLayer.create({
      id: "L",
      name: "Layer",
      elements: [{ ...shape, createdAt: 1700000000000 }],
    });
    const [out] = serializeLayers([layer]) as any[];
    expect(out.elements[0].createdAt).toBe(1700000000000);
  });

  it("arrow and text keep createdAt in snapshots", () => {
    expect((getSnapshot(ArrowElement.create({ ...arrow, createdAt: 5 })) as any).createdAt).toBe(5);
    expect((getSnapshot(TextElement.create({ ...text, createdAt: 6 })) as any).createdAt).toBe(6);
  });

  it("elements without createdAt stay valid", () => {
    expect(ShapeElement.create(shape).createdAt).toBeUndefined();
    expect(ArrowElement.create(arrow).createdAt).toBeUndefined();
    expect(TextElement.create(text).createdAt).toBeUndefined();
  });
});
