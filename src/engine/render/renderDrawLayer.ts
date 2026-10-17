import type { BrushOptions, BrushStyle, ElementLike, ShapeElementLike, StrokeLike } from "../types";
import { elementKind } from "../types";
import { brushRegistry } from "./BrushRegistry";
import type { ElementLookup } from "./lookup";
import { renderShape } from "./renderShape";
import { renderStroke } from "./renderStroke";

export interface DrawLayerRenderOptions {
  getBrushOptions?: (brush: BrushStyle, size: number) => BrushOptions | undefined;
  pending?: Set<string>;
  lookup?: ElementLookup;
  hidden?: string | null;
}

export function renderDrawLayer(
  ctx: CanvasRenderingContext2D,
  elements: readonly ElementLike[],
  opts: DrawLayerRenderOptions = {},
) {
  for (const el of elements) {
    if (opts.hidden && el.id === opts.hidden) continue;
    const faded = opts.pending?.has(el.id);
    if (faded) {
      ctx.save();
      ctx.globalAlpha *= 0.25;
    }
    const kind = elementKind(el);
    if (kind === "shape") renderShape(ctx, el as ShapeElementLike);
    else if (kind === "stroke") renderStroke(ctx, el as StrokeLike, brushRegistry, opts.getBrushOptions);
    if (faded) ctx.restore();
  }
}
