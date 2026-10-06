import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

export class CalligraphyBrush implements Brush {
  key = "calligraphy" as const;
  label = "Calligraphy";
  presets: BrushPreset[] = [
    { id: "italic", label: "Italic", size: 28, opacity: 1, angle: 30 },
    { id: "classic", label: "Classic", size: 28, opacity: 1, angle: 45 },
    { id: "flat", label: "Flat", size: 28, opacity: 1, angle: 0 },
    { id: "upright", label: "Upright", size: 28, opacity: 1, angle: 90 },
  ];
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const pts = stroke.points;
    if (pts.length === 0) return;

    const angle = ((stroke.angle ?? options?.angle ?? 45) * Math.PI) / 180;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const half = stroke.size / 2;

    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;

    if (pts.length === 1) {
      const p = pts[0];
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, stroke.size * 0.15);
      ctx.beginPath();
      ctx.moveTo(p.x - nx * half, p.y - ny * half);
      ctx.lineTo(p.x + nx * half, p.y + ny * half);
      ctx.stroke();
    } else {
      const top: Array<{ x: number; y: number }> = [];
      const bottom: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const pressure = p.pressure ?? 1;
        const h = half * (0.35 + 0.65 * pressure);
        top.push({ x: p.x + nx * h, y: p.y + ny * h });
        bottom.push({ x: p.x - nx * h, y: p.y - ny * h });
      }
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < top.length; i++) ctx.lineTo(top[i].x, top[i].y);
      for (let i = bottom.length - 1; i >= 0; i--) {
        ctx.lineTo(bottom[i].x, bottom[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = prevAlpha;
  }
}
