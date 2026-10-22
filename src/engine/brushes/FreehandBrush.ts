import { getStroke } from "perfect-freehand";
import { easingFn } from "../easing";
import { toPathData } from "../render/pathData";
import type {
  Brush,
  BrushOptions,
  StrokeLike,
  StrokeSettingKey,
} from "../types";
import type { SvgContext } from "../svg/SvgContext";

export class FreehandBrush implements Brush {
  key = "ink" as const;
  label = "Pen";
  category = "draw" as const;
  strokeSettings: StrokeSettingKey[] = ["variation", "stabilizer", "smoothing", "taper"];
  strokeDefaults = {
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    taperStart: 30,
    taperEnd: 30,
  };

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    let path = stroke.live ? undefined : outlines.get(stroke);
    if (path === undefined) {
      path = outlinePath(stroke, options);
      if (!stroke.live) outlines.set(stroke, path);
    }
    if (!path) return;
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.fill(path);
    ctx.globalAlpha = prevAlpha;
  }

  renderSvg(ctx: SvgContext, stroke: StrokeLike, options?: BrushOptions) {
    const d = outlineData(stroke, options);
    if (!d) return;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha *= stroke.opacity ?? 1;
    ctx.fillPathData(d);
  }
}

const outlines = new WeakMap<StrokeLike, Path2D | null>();

function outlinePath(stroke: StrokeLike, options?: BrushOptions): Path2D | null {
  const d = outlineData(stroke, options);
  return d ? new Path2D(d) : null;
}

export function outlineData(stroke: StrokeLike, options?: BrushOptions): string | null {
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
    simulatePressure: stroke.input !== "pen",
    last: true,
  } as any);
  if (outline.length < 3) return null;
  return toPathData(outline);
}
