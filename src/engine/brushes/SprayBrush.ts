import type { Brush, BrushOptions, StrokeLike } from "../types";
import { seededRandom } from "../render/seededRandom";

const MAX_DOTS = 8000;

export class SprayBrush implements Brush {
  key = "spray" as const;
  label = "Spray";
  defaults: Partial<BrushOptions> = {
    thinning: 0.8,
    smoothing: 0.3,
    streamline: 0.3,
    start: { cap: false, taper: 0, easing: (t: number) => t },
    end: { cap: false, taper: 0, easing: (t: number) => t },
    density: 0.3,
    scatter: 0.8,
    dotMin: 0.5,
    dotRange: 2,
  };
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const size = stroke.size;
    const densityScale = options?.density ?? 0.3;
    const scatterScale = options?.scatter ?? 0.8;
    const dotMin = options?.dotMin ?? 0.5;
    const dotRange = options?.dotRange ?? 2;
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    let total = 0;
    for (let i = 0; i < stroke.points.length; i++) {
      if (total >= MAX_DOTS) break;
      const { x, y, pressure = 0.5 } = stroke.points[i];
      const currentSize = size * pressure;
      const density = Math.max(3, currentSize * densityScale);
      for (let j = 0; j < density; j++) {
        if (total >= MAX_DOTS) break;
        const s1 = x * 1000 + y * 100 + j * 10 + i;
        const s2 = x * 100 + y * 1000 + j * 5 + i * 2;
        const s3 = x * 10 + y * 10 + j + i * 3;
        const angle = seededRandom(s1) * Math.PI * 2;
        const distance = seededRandom(s2) * currentSize * scatterScale;
        const sx = x + Math.cos(angle) * distance;
        const sy = y + Math.sin(angle) * distance;
        const dot = seededRandom(s3) * dotRange + dotMin;
        ctx.beginPath();
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
        ctx.fill();
        total++;
      }
    }
    ctx.globalAlpha = prevAlpha;
  }
}
