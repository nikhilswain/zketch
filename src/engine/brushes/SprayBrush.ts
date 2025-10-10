import type { Brush, StrokeLike } from "../types";

const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export class SprayBrush implements Brush {
  key = "spray" as const;
  render(ctx: CanvasRenderingContext2D, stroke: StrokeLike) {
    const size = stroke.size;
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    for (let i = 0; i < stroke.points.length; i++) {
      const { x, y, pressure = 0.5 } = stroke.points[i];
      const currentSize = size * pressure;
      const density = Math.max(3, currentSize * 0.3);
      for (let j = 0; j < density; j++) {
        const s1 = x * 1000 + y * 100 + j * 10 + i;
        const s2 = x * 100 + y * 1000 + j * 5 + i * 2;
        const s3 = x * 10 + y * 10 + j + i * 3;
        const angle = seededRandom(s1) * Math.PI * 2;
        const distance = seededRandom(s2) * currentSize * 0.8;
        const sx = x + Math.cos(angle) * distance;
        const sy = y + Math.sin(angle) * distance;
        const dot = seededRandom(s3) * 2 + 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = prevAlpha;
  }
}
