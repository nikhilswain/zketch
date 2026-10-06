import { getStroke } from "perfect-freehand";
import { toPathData } from "../render/pathData";
import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

export class MarkerBrush implements Brush {
  key = "marker" as const;
  label = "Marker";
  defaults: Partial<BrushOptions> = {
    thinning: 0.15,
    smoothing: 0.45,
    streamline: 0.4,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  };
  presets: BrushPreset[] = [
    { id: "round", label: "Round", size: 16, opacity: 0.75 },
    { id: "fine", label: "Fine", size: 8, opacity: 0.85 },
    { id: "broad", label: "Broad", size: 26, opacity: 0.7 },
    { id: "sheer", label: "Sheer", size: 20, opacity: 0.4 },
  ];
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
    const outline = getStroke(pts, {
      size: stroke.size,
      thinning: stroke.thinning ?? options?.thinning ?? 0.15,
      smoothing: stroke.smoothing ?? options?.smoothing ?? 0.45,
      streamline: stroke.streamline ?? options?.streamline ?? 0.4,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
      last: true,
    } as any);
    if (outline.length < 3) return;

    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.fillStyle = stroke.color;
    ctx.fill(new Path2D(toPathData(outline)));
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }
}
