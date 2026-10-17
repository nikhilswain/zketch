import type { TextElementLike } from "../types";
import { fontString } from "../geometry/textLayout";
import type { TextPlacement } from "../geometry/labels";
import { requestFont } from "./fonts";

export function renderText(ctx: CanvasRenderingContext2D, t: TextElementLike, placement: TextPlacement) {
  if (!t.text) return;
  requestFont(t.fontFamily);
  const { box, layout } = placement;
  ctx.save();
  if (t.opacity !== undefined && t.opacity !== 1) ctx.globalAlpha *= t.opacity;
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180);
  ctx.font = fontString(t.fontFamily, t.fontSize);
  ctx.fillStyle = t.color;
  ctx.textBaseline = "middle";
  const align = t.containerId ? "center" : t.align;
  ctx.textAlign = align;
  const x = align === "left" ? -box.width / 2 : align === "right" ? box.width / 2 : 0;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, x, -box.height / 2 + layout.lineHeight * (i + 0.5));
  });
  ctx.restore();
}
