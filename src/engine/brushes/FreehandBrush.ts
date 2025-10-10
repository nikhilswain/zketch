import { getStroke } from "perfect-freehand";
import type { Brush, BrushOptions, StrokeLike } from "../types";

export class FreehandBrush implements Brush {
  key = "ink" as const;

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions
  ) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
    const outline = getStroke(pts, {
      size: stroke.size,
      thinning: options?.thinning ?? 0.5,
      smoothing: options?.smoothing ?? 0.5,
      streamline: options?.streamline ?? 0.5,
      easing: options?.easing ?? ((t: number) => t),
      start: options?.start ?? { taper: 0 },
      end: options?.end ?? { taper: 0 },
      last: true,
    } as any);
    if (outline.length < 3) return;

    const path = new Path2D(this.toPathData(outline));
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.fill(path);
    ctx.globalAlpha = prevAlpha;
  }

  private toPathData(points: number[][]) {
    const average = (a: number, b: number) => (a + b) / 2;
    const len = points.length;
    let a = points[0],
      b = points[1],
      c = points[2];
    let result = `M${a[0]},${a[1]} Q${b[0]},${b[1]} ${average(
      b[0],
      c[0]
    )},${average(b[1], c[1])} T`;
    for (let i = 2; i < len - 1; i++) {
      a = points[i];
      b = points[i + 1];
      result += `${average(a[0], b[0])},${average(a[1], b[1])} `;
    }
    result += "Z";
    return result;
  }
}
