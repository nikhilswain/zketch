import type {
  ArrowElementLike,
  BrushOptions,
  BrushStyle,
  ElementLike,
  ShapeElementLike,
  StrokeLike,
  TextElementLike,
} from "../types";
import { elementKind } from "../types";
import { labelPlacement, labelsByContainer, textPlacement } from "../geometry/labels";
import { brushRegistry } from "./BrushRegistry";
import { measureText } from "./fonts";
import type { ElementLookup } from "./lookup";
import { renderArrow } from "./renderArrow";
import { renderShape } from "./renderShape";
import { renderStroke } from "./renderStroke";
import { renderText } from "./renderText";

export interface DrawLayerRenderOptions {
  getBrushOptions?: (brush: BrushStyle, size: number) => BrushOptions | undefined;
  pending?: Set<string>;
  lookup?: ElementLookup;
  hidden?: string | null;
}

function localLookup(elements: readonly ElementLike[]): ElementLookup {
  const map: ElementLookup = new Map();
  for (const el of elements) map.set(el.id, el);
  return map;
}

export function renderDrawLayer(
  ctx: CanvasRenderingContext2D,
  elements: readonly ElementLike[],
  opts: DrawLayerRenderOptions = {},
) {
  const lookup = opts.lookup ?? localLookup(elements);
  const labels = labelsByContainer(elements);
  const pending = opts.pending;

  const withFade = (id: string, draw: () => void) => {
    const faded = pending?.has(id);
    if (faded) {
      ctx.save();
      ctx.globalAlpha *= 0.25;
    }
    draw();
    if (faded) ctx.restore();
  };

  const drawLabel = (container: ElementLike) => {
    const label = labels.get(container.id);
    if (!label || label.id === opts.hidden || !label.text) return null;
    const placement = labelPlacement(container, label, lookup, measureText);
    if (!placement) return null;
    return { label, placement };
  };

  for (const el of elements) {
    if (opts.hidden && el.id === opts.hidden) continue;
    const kind = elementKind(el);
    if (kind === "text") {
      const t = el as TextElementLike;
      if (t.containerId) continue;
      const placement = textPlacement(t, lookup, measureText);
      if (placement) withFade(t.id, () => renderText(ctx, t, placement));
      continue;
    }
    if (kind === "stroke") {
      withFade(el.id, () => renderStroke(ctx, el as StrokeLike, brushRegistry, opts.getBrushOptions));
      continue;
    }
    const label = drawLabel(el);
    withFade(el.id, () => {
      if (kind === "shape") renderShape(ctx, el as ShapeElementLike);
      else renderArrow(ctx, el as ArrowElementLike, lookup, measureText, label?.placement.box ?? null);
      if (label) renderText(ctx, label.label, label.placement);
    });
  }
}
