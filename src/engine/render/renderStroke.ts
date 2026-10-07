import type { BrushOptions, BrushStyle, StrokeLike } from "../types";
import type { BrushRegistry } from "./BrushRegistry";

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeLike,
  registry: BrushRegistry,
  getBrushOptions?: (
    brush: BrushStyle,
    size: number,
  ) => BrushOptions | undefined,
) {
  const isEraser = stroke.brushStyle === "eraser";
  const key = isEraser ? "ink" : stroke.brushStyle;
  const brush = registry.get(key);
  if (!brush) return;

  const strokeForRender = isEraser
    ? { ...stroke, taperStart: 0, taperEnd: 0, opacity: 1 }
    : stroke;

  const opts = getBrushOptions?.(key, stroke.size);
  ctx.save();
  if (isEraser) ctx.globalCompositeOperation = "destination-out";
  brush.render(ctx, strokeForRender, opts);
  ctx.restore();
}
