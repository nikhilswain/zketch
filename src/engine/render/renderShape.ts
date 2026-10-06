import type { ShapeElementLike } from "../types";
import { traceShape } from "./shapePaths";

export function renderShape(ctx: CanvasRenderingContext2D, shape: ShapeElementLike) {
  const {
    x,
    y,
    width,
    height,
    rotation,
    strokeColor,
    strokeWidth,
    fillColor,
    opacity,
  } = shape;

  ctx.save();
  if (opacity !== undefined && opacity !== 1) {
    ctx.globalAlpha = ctx.globalAlpha * opacity;
  }
  if (rotation !== 0) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  traceShape(ctx, shape);

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  ctx.restore();
}
