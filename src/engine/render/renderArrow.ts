import type { ArrowElementLike, ElementLike } from "../types";
import {
  arrowheadShape,
  curveAngleAt,
  curveLength,
  headInset,
  resolveArrow,
  subCurve,
  type HeadShape,
  type ResolvedArrow,
} from "../geometry/arrow";
import type { Box } from "../geometry/outline";
import type { Measure } from "../geometry/textLayout";

export function traceCurve(ctx: CanvasRenderingContext2D, r: ResolvedArrow) {
  ctx.moveTo(r.start.x, r.start.y);
  ctx.quadraticCurveTo(r.control.x, r.control.y, r.end.x, r.end.y);
}

function drawHead(ctx: CanvasRenderingContext2D, head: HeadShape | null) {
  if (!head) return;
  ctx.beginPath();
  if (head.type === "circle") {
    ctx.arc(head.center.x, head.center.y, head.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(head.points[0].x, head.points[0].y);
  for (let i = 1; i < head.points.length; i++) ctx.lineTo(head.points[i].x, head.points[i].y);
  if (head.type === "polygon") {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();
}

export function arrowBody(a: ArrowElementLike, r: ResolvedArrow): ResolvedArrow {
  const len = curveLength(r);
  if (len < 1) return r;
  const t0 = Math.min(0.45, headInset(a.startHead, a.strokeWidth) / len);
  const t1 = 1 - Math.min(0.45, headInset(a.endHead, a.strokeWidth) / len);
  return t0 > 0 || t1 < 1 ? subCurve(r, t0, t1) : r;
}

export function arrowHeads(a: ArrowElementLike, r: ResolvedArrow): (HeadShape | null)[] {
  return [
    arrowheadShape(a.startHead, r.start, curveAngleAt(r, 0) + Math.PI, a.strokeWidth),
    arrowheadShape(a.endHead, r.end, curveAngleAt(r, 1), a.strokeWidth),
  ];
}

export function clipOutBox(ctx: CanvasRenderingContext2D, box: Box, pad = 4) {
  const big = 1e6;
  ctx.beginPath();
  ctx.rect(-big, -big, big * 2, big * 2);
  ctx.rect(box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2);
  ctx.clip("evenodd");
}

export function renderArrow(
  ctx: CanvasRenderingContext2D,
  a: ArrowElementLike,
  lookup: Map<string, ElementLike> | undefined,
  measure: Measure,
  labelBox: Box | null,
  drawBody?: (ctx: CanvasRenderingContext2D, body: ResolvedArrow) => void,
) {
  const r = resolveArrow(a, lookup, measure);
  ctx.save();
  if (a.opacity !== undefined && a.opacity !== 1) ctx.globalAlpha *= a.opacity;
  ctx.strokeStyle = a.strokeColor;
  ctx.fillStyle = a.strokeColor;
  ctx.lineWidth = a.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.save();
  if (labelBox) clipOutBox(ctx, labelBox);
  const body = arrowBody(a, r);
  if (drawBody) drawBody(ctx, body);
  else {
    ctx.beginPath();
    traceCurve(ctx, body);
    ctx.stroke();
  }
  ctx.restore();
  for (const head of arrowHeads(a, r)) drawHead(ctx, head);
  ctx.restore();
}
