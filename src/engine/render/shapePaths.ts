import type { ShapeElementLike } from "../types";

export function traceShape(ctx: CanvasRenderingContext2D, shape: ShapeElementLike) {
  const { shapeType, x, y, width, height, cornerRadius } = shape;
  switch (shapeType) {
    case "rectangle":
      pathRoundedRect(ctx, x, y, width, height, cornerRadius);
      break;
    case "circle":
      ctx.ellipse(
        x + width / 2,
        y + height / 2,
        Math.max(1, width / 2),
        Math.max(1, height / 2),
        0,
        0,
        Math.PI * 2,
      );
      break;
    case "diamond":
      pathDiamond(ctx, x, y, width, height, cornerRadius);
      break;
    case "triangle":
      pathTriangle(ctx, x, y, width, height, cornerRadius);
      break;
  }
}

function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function pathDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pts = [
    { x: cx, y: y },
    { x: x + w, y: cy },
    { x: cx, y: y + h },
    { x: x, y: cy },
  ];
  if (r <= 0) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  const radius = Math.min(r, Math.min(w, h) / 4);
  for (let i = 0; i < 4; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % 4];
    const prev = pts[(i + 3) % 4];
    const dxNext = next.x - cur.x;
    const dyNext = next.y - cur.y;
    const lenNext = Math.hypot(dxNext, dyNext);
    const dxPrev = prev.x - cur.x;
    const dyPrev = prev.y - cur.y;
    const lenPrev = Math.hypot(dxPrev, dyPrev);
    const tNext = Math.min(0.5, radius / Math.max(1, lenNext));
    const tPrev = Math.min(0.5, radius / Math.max(1, lenPrev));
    const startX = cur.x + dxPrev * tPrev;
    const startY = cur.y + dyPrev * tPrev;
    const endX = cur.x + dxNext * tNext;
    const endY = cur.y + dyNext * tNext;
    if (i === 0) ctx.moveTo(startX, startY);
    else ctx.lineTo(startX, startY);
    ctx.quadraticCurveTo(cur.x, cur.y, endX, endY);
  }
  ctx.closePath();
}

function pathTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const pts = [
    { x: x + w / 2, y: y },
    { x: x + w, y: y + h },
    { x: x, y: y + h },
  ];
  if (r <= 0) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 3; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  const radius = Math.min(r, Math.min(w, h) / 4);
  for (let i = 0; i < 3; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % 3];
    const prev = pts[(i + 2) % 3];
    const dxNext = next.x - cur.x;
    const dyNext = next.y - cur.y;
    const lenNext = Math.hypot(dxNext, dyNext);
    const dxPrev = prev.x - cur.x;
    const dyPrev = prev.y - cur.y;
    const lenPrev = Math.hypot(dxPrev, dyPrev);
    const tNext = Math.min(0.5, radius / Math.max(1, lenNext));
    const tPrev = Math.min(0.5, radius / Math.max(1, lenPrev));
    const startX = cur.x + dxPrev * tPrev;
    const startY = cur.y + dyPrev * tPrev;
    const endX = cur.x + dxNext * tNext;
    const endY = cur.y + dyNext * tNext;
    if (i === 0) ctx.moveTo(startX, startY);
    else ctx.lineTo(startX, startY);
    ctx.quadraticCurveTo(cur.x, cur.y, endX, endY);
  }
  ctx.closePath();
}
