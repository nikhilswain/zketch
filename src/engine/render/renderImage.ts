import type { ImageLayerLike } from "../types";

export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  layer: ImageLayerLike,
) {
  const { x, y, width, height, rotation } = layer;

  ctx.save();

  if (rotation !== 0) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
  } else {
    ctx.drawImage(img, x, y, width, height);
  }

  ctx.restore();
}
