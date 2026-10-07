import type { Brush, BrushPreset, StrokeLike } from "../types";
import { smoothPoints } from "../render/smooth";

export class HighlighterBrush implements Brush {
  key = "highlighter" as const;
  label = "Highlighter";
  presets: BrushPreset[] = [
    { id: "classic", label: "Classic", size: 34, opacity: 0.35 },
    { id: "narrow", label: "Narrow", size: 16, opacity: 0.45 },
    { id: "neon", label: "Neon", size: 44, opacity: 0.22 },
  ];
  render(ctx: CanvasRenderingContext2D, stroke: StrokeLike) {
    const raw = stroke.points;
    if (raw.length === 0) return;
    const pts = smoothPoints(raw);

    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = (stroke.opacity ?? 0.35) * prevAlpha;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevComp;
  }
}
