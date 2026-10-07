import { smoothPoints } from "../render/smooth";
import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const SHADOW_SHIFT_PX = 100000;

export class AirbrushBrush implements Brush {
  key = "airbrush" as const;
  label = "Airbrush";
  presets: BrushPreset[] = [
    { id: "soft", label: "Soft", size: 70, opacity: 0.55, softness: 0.9 },
    { id: "medium", label: "Medium", size: 48, opacity: 0.7, softness: 0.6 },
    { id: "hard", label: "Hard", size: 40, opacity: 0.85, softness: 0.35 },
    { id: "fine", label: "Fine", size: 24, opacity: 0.8, softness: 0.5 },
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

    const t = ctx.getTransform();
    const scale = Math.hypot(t.a, t.b) || 1;
    const blurPx = Math.max(0.3, softness * size * 0.5 * scale);

    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    const prevFilter = ctx.filter;

    ctx.save();
    if (typeof prevFilter === "string") {
      ctx.filter = `blur(${blurPx}px)`;
    } else {
      const shift = SHADOW_SHIFT_PX / scale;
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = blurPx * 2;
      ctx.shadowOffsetX = -SHADOW_SHIFT_PX;
      ctx.translate(shift, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = flow * prevAlpha;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, size / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, size);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }
}
