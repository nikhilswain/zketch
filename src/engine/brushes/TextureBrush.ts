import { getStroke } from "perfect-freehand";
import type { Brush, BrushOptions, StrokeLike } from "../types";
import { seededRandom } from "../render/seededRandom";
import { toPathData } from "../render/pathData";

export class TextureBrush implements Brush {
  key = "texture" as const;
  label = "Texture";
  legacy = true;
  defaults: Partial<BrushOptions> = {
    thinning: 0.7,
    smoothing: 0.5,
    streamline: 0.5,
    start: { cap: false, taper: 10, easing: (t: number) => t },
    end: { cap: false, taper: 10, easing: (t: number) => t },
  };
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
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
      // Use stroke's own settings first, then fallback to options, then defaults
      const outline = getStroke(
        offsetPts as any,
        {
          size: stroke.size * (0.8 + layer * 0.1),
          thinning: stroke.thinning ?? options?.thinning ?? 0.7,
          smoothing: stroke.smoothing ?? options?.smoothing ?? 0.5,
          streamline: stroke.streamline ?? options?.streamline ?? 0.5,
          start: { cap: false, taper: stroke.taperStart ?? 10 },
          end: { cap: false, taper: stroke.taperEnd ?? 10 },
          last: true,
        } as any,
      );
      if (outline.length < 3) continue;
      ctx.globalAlpha = (stroke.opacity ?? 1) * layerOpacity * baseAlpha;
      const path = new Path2D(toPathData(outline));
      ctx.fillStyle = stroke.color;
      ctx.fill(path);
    }
    ctx.globalAlpha = baseAlpha;
  }
}
