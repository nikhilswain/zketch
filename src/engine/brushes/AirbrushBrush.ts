import { withAlpha } from "../render/color";
import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const MAX_DABS = 2500;

export class AirbrushBrush implements Brush {
  key = "airbrush" as const;
  label = "Airbrush";
  presets: BrushPreset[] = [
    { id: "soft", label: "Soft", size: 70, opacity: 0.22, softness: 0.85 },
    { id: "medium", label: "Medium", size: 48, opacity: 0.3, softness: 0.55 },
    { id: "hard", label: "Hard", size: 40, opacity: 0.45, softness: 0.12 },
    { id: "fine", label: "Fine", size: 22, opacity: 0.4, softness: 0.5 },
  ];
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const pts = stroke.points;
    if (pts.length === 0) return;

    const radius = Math.max(1, stroke.size / 2);
    const softness = Math.max(
      0,
      Math.min(1, stroke.softness ?? options?.softness ?? 0.6),
    );
    const flow = Math.max(0.02, Math.min(1, stroke.opacity ?? 1));
    const inner = radius * (1 - softness);
    const step = Math.max(1, radius * 0.3);

    let dabs = 0;
    const dab = (x: number, y: number) => {
      if (dabs >= MAX_DABS) return;
      dabs++;
      const g = ctx.createRadialGradient(x, y, inner, x, y, radius);
      g.addColorStop(0, withAlpha(stroke.color, flow));
      g.addColorStop(1, withAlpha(stroke.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    if (pts.length === 1) {
      dab(pts[0].x, pts[0].y);
      return;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let s = 0; s < n; s++) {
        const t = s / n;
        dab(a.x + dx * t, a.y + dy * t);
      }
    }
    dab(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
}
