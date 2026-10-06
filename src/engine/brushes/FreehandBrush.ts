import { getStroke } from "perfect-freehand";
import { easingFn } from "../easing";
import { toPathData } from "../render/pathData";
import type { Brush, BrushOptions, StrokeLike } from "../types";

export class FreehandBrush implements Brush {
  key = "ink" as const;
  label = "Pen";

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
    // Use stroke's own settings first, then fallback to options, then defaults
    const outline = getStroke(pts, {
      size: stroke.size,
      thinning: stroke.thinning ?? options?.thinning ?? 0.5,
      smoothing: stroke.smoothing ?? options?.smoothing ?? 0.5,
      streamline: stroke.streamline ?? options?.streamline ?? 0.5,
      easing: easingFn(stroke.easing ?? "linear"),
      start: { taper: stroke.taperStart ?? options?.start?.taper ?? 0 },
      end: { taper: stroke.taperEnd ?? options?.end?.taper ?? 0 },
      last: true,
    } as any);
    if (outline.length < 3) return;

    const path = new Path2D(toPathData(outline));
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.fill(path);
    ctx.globalAlpha = prevAlpha;
  }
}
