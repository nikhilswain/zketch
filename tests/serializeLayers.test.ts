import { describe, expect, it } from "vitest";
import { DrawLayer } from "@/models/LayerModel";
import { serializeLayers } from "@/utils/serializeLayers";

function stroke(id: string, n = 50) {
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: i, y: 0, pressure: 0.5 });
  return {
    id,
    points,
    color: "#000000",
    size: 4,
    brushStyle: "ink",
    timestamp: 0,
  };
}

describe("serializeLayers", () => {
  it("serializes draw layer strokes with optimized points", () => {
    const layer = DrawLayer.create({ id: "L", name: "Layer", elements: [] });
    layer.addStroke(stroke("a"));
    const [out] = serializeLayers([layer]) as any[];
    expect(out.type).toBe("draw");
    expect(out.elements).toHaveLength(1);
    expect(out.elements[0].id).toBe("a");
    expect(out.elements[0].opacity).toBe(1);
    expect(out.elements[0].points.length).toBeLessThan(50);
  });

  it("reuses serialized elements that did not change", () => {
    const layer = DrawLayer.create({ id: "L", name: "Layer", elements: [] });
    layer.addStroke(stroke("a"));
    const [first] = serializeLayers([layer]) as any[];
    layer.addStroke(stroke("b"));
    const [second] = serializeLayers([layer]) as any[];
    expect(second.elements).toHaveLength(2);
    expect(second.elements[0]).toBe(first.elements[0]);
  });
});
