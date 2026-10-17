import type { ArrowElementLike, ElementLike, ShapeElementLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import { curvePoint, resolveArrow } from "./arrow";
import { boxCenter, freeTextBox, shapeBox, type Box } from "./outline";
import { layoutText, type Measure, type TextLayout } from "./textLayout";

export const LABEL_PADDING = 8;

export interface TextPlacement {
  box: Box;
  maxWidth: number | null;
  layout: TextLayout;
}

export function labelPlacement(
  container: ElementLike,
  label: TextElementLike,
  lookup: Map<string, ElementLike> | undefined,
  measure: Measure,
): TextPlacement | null {
  const kind = elementKind(container);
  if (kind === "shape") {
    const sb = shapeBox(container as ShapeElementLike);
    const maxWidth = Math.max(20, sb.width - LABEL_PADDING * 2);
    const layout = layoutText(label.text, label.fontSize, label.fontFamily, maxWidth, measure);
    const c = boxCenter(sb);
    return {
      box: { x: c.x - maxWidth / 2, y: c.y - layout.height / 2, width: maxWidth, height: layout.height, rotation: sb.rotation },
      maxWidth,
      layout,
    };
  }
  if (kind === "arrow") {
    const r = resolveArrow(container as ArrowElementLike, lookup, measure);
    const p = curvePoint(r, 0.5);
    const layout = layoutText(label.text, label.fontSize, label.fontFamily, null, measure);
    return {
      box: { x: p.x - layout.width / 2, y: p.y - layout.height / 2, width: layout.width, height: layout.height, rotation: 0 },
      maxWidth: null,
      layout,
    };
  }
  return null;
}

export function textPlacement(
  t: TextElementLike,
  lookup: Map<string, ElementLike> | undefined,
  measure: Measure,
): TextPlacement | null {
  if (t.containerId) {
    const container = lookup?.get(t.containerId);
    return container ? labelPlacement(container, t, lookup, measure) : null;
  }
  const layout = layoutText(t.text, t.fontSize, t.fontFamily, null, measure);
  return { box: freeTextBox(t, measure), maxWidth: null, layout };
}

export function labelsByContainer(elements: readonly ElementLike[]): Map<string, TextElementLike> {
  const map = new Map<string, TextElementLike>();
  for (const el of elements) {
    if (elementKind(el) === "text" && (el as TextElementLike).containerId) {
      map.set((el as TextElementLike).containerId!, el as TextElementLike);
    }
  }
  return map;
}
