import { describe, expect, it } from "vitest";
import { getSnapshot } from "mobx-state-tree";
import { CanvasModel } from "@/models/CanvasModel";
import { padToDrawing } from "@/landing/handoff";
import { doodleById } from "@/landing/doodles/library";

describe("landing pad hand-off", () => {
  it("saves a drawing the app's loader accepts", () => {
    const strokes = doodleById("apple")!.make(4).strokes.map((s, i) => (i === 0 ? { ...s, live: true } : s));
    const drawing = padToDrawing(strokes, "data:image/png;base64,", new Date(0));
    expect(drawing.layers).toHaveLength(1);
    expect(drawing.activeLayerId).toBe(drawing.layers[0].id);

    const canvas = CanvasModel.create({});
    const layer = drawing.layers[0] as { id: string; name: string; type: string; visible: boolean; locked: boolean; opacity: number; elements: unknown[] };
    canvas.loadLayers([{ id: layer.id, name: layer.name, type: layer.type, visible: layer.visible, locked: layer.locked, opacity: layer.opacity, elements: layer.elements }], drawing.activeLayerId);

    const loaded = getSnapshot(canvas.layers)[0] as { elements: { id: string; points: { x: number; y: number }[]; startTime: number | null; brushStyle: string }[] };
    expect(loaded.elements).toHaveLength(strokes.length);
    expect(loaded.elements[0].points[0].x).toBeCloseTo(strokes[0].points[0].x, 1);
    expect(loaded.elements[3].startTime).toBe(strokes[3].startTime);
    expect(loaded.elements[0].brushStyle).toBe(strokes[0].brushStyle);
    expect((layer.elements[0] as { live?: boolean }).live).toBeUndefined();
  });
});
