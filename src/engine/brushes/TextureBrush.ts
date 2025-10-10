import { getStroke } from "perfect-freehand";
import type { Brush, BrushOptions, StrokeLike } from "../types";

const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export class TextureBrush implements Brush {
  key = "texture" as const;
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions
  ) {
    const baseAlpha = ctx.globalAlpha;
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
    for (let layer = 0; layer < 3; layer++) {
      const layerOpacity = 0.3 - layer * 0.1;
      const offset = layer * 2;
      const offsetPts = pts.map(([x, y, pr], idx) => {
        const s1 = x * 1000 + y * 100 + layer * 50 + idx;
        const s2 = x * 100 + y * 1000 + layer * 25 + idx * 2;
        return [
          x + (seededRandom(s1) - 0.5) * offset,
          y + (seededRandom(s2) - 0.5) * offset,
          pr,
        ];
      });
      const outline = getStroke(
        offsetPts as any,
        {
          size: stroke.size * (0.8 + layer * 0.1),
          thinning: options?.thinning ?? 0.7,
          smoothing: options?.smoothing ?? 0.5,
          streamline: options?.streamline ?? 0.5,
          start: { cap: false, taper: 10 },
          end: { cap: false, taper: 10 },
          last: true,
        } as any
      );
      if (outline.length < 3) continue;
      ctx.globalAlpha = (stroke.opacity ?? 1) * layerOpacity * baseAlpha;
      const path = new Path2D(this.toPathData(outline));
      ctx.fillStyle = stroke.color;
      ctx.fill(path);
    }
    ctx.globalAlpha = baseAlpha;
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
