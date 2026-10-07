import { smoothPoints } from "../render/smooth";
import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class AirbrushBrush implements Brush {
  key = "airbrush" as const;
  label = "Airbrush";
  presets: BrushPreset[] = [
    { id: "soft", label: "Soft", size: 70, opacity: 0.5, softness: 0.9 },
    { id: "medium", label: "Medium", size: 48, opacity: 0.6, softness: 0.6 },
    { id: "hard", label: "Hard", size: 40, opacity: 0.75, softness: 0.15 },
    { id: "fine", label: "Fine", size: 24, opacity: 0.7, softness: 0.5 },
  ];
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const raw = stroke.points;
    if (raw.length === 0) return;
    const pts = smoothPoints(raw);

    const size = stroke.size;
    const softness = clamp01(stroke.softness ?? options?.softness ?? 0.6);
    const flow = Math.max(0.05, clamp01(stroke.opacity ?? 1));
    const layers = Math.max(5, Math.round(6 + softness * 12));
    const layerAlpha = flow / layers;

    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      const p = pts[0];
      for (let k = 0; k < layers; k++) {
        const r = Math.max(0.5, (size / 2) * (1 - k / layers));
        ctx.globalAlpha = prevAlpha * layerAlpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      for (let k = 0; k < layers; k++) {
        ctx.lineWidth = Math.max(1, size * (1 - k / layers));
        ctx.globalAlpha = prevAlpha * layerAlpha;
        ctx.stroke();
      }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }
}
