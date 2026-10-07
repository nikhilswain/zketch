import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";
import { smoothPoints } from "../render/smooth";

export class CalligraphyBrush implements Brush {
  key = "calligraphy" as const;
  label = "Calligraphy";
  presets: BrushPreset[] = [
    { id: "italic", label: "Italic", size: 28, opacity: 1, angle: 30 },
    { id: "classic", label: "Classic", size: 28, opacity: 1, angle: 45 },
    { id: "flat", label: "Flat", size: 28, opacity: 1, angle: 0 },
    { id: "upright", label: "Upright", size: 28, opacity: 1, angle: 90 },
  ];

  private strokeSegments(
    ctx: CanvasRenderingContext2D,
    pts: ReturnType<typeof smoothPoints>,
    angle: number,
    half: number,
    nibThickness: number,
    stepPx: number,
  ) {
    const T = nibThickness;

    const draw = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const n = Math.max(1, Math.ceil(len / stepPx));
      for (let s = 0; s < n; s++) {
        const t0 = s / n;
        const t1 = (s + 1) / n;
        const x0 = a.x + dx * t0;
        const y0 = a.y + dy * t0;
        const x1 = a.x + dx * t1;
        const y1 = a.y + dy * t1;
        const dir = Math.atan2(y1 - y0, x1 - x0);
        const proj = Math.abs(Math.sin(dir - angle));
        const pressure = a.pressure + (b.pressure - a.pressure) * t0;
        const h = half * (0.35 + 0.65 * pressure);
        const w = T + (2 * h - T) * proj;
        draw(x0, y0, x1, y1, w);
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const raw = stroke.points;
    if (raw.length === 0) return;
    const pts = smoothPoints(raw);

    const angle = ((stroke.angle ?? options?.angle ?? 45) * Math.PI) / 180;
    const half = stroke.size / 2;
    const nibThickness = Math.max(1, stroke.size * 0.1);
    const stepPx = Math.max(1.5, nibThickness * 0.8);
    const opacity = stroke.opacity ?? 1;

    const prevAlpha = ctx.globalAlpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;

    if (pts.length === 1) {
      ctx.globalAlpha = opacity * prevAlpha;
      const p = pts[0];
      const h = half * (0.35 + 0.65 * p.pressure);
      ctx.lineWidth = Math.max(nibThickness, 2 * h);
      ctx.beginPath();
      ctx.moveTo(p.x - 0.01, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = prevAlpha;
      return;
    }

    const canOffscreen =
      opacity < 1 && typeof document !== "undefined";
    if (canOffscreen) {
      const canvas = ctx.canvas;
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d");
      if (octx) {
        octx.setTransform(ctx.getTransform());
        octx.lineCap = "round";
        octx.lineJoin = "round";
        octx.strokeStyle = stroke.color;
        this.strokeSegments(octx, pts, angle, half, nibThickness, stepPx);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = opacity * prevAlpha;
        ctx.drawImage(off, 0, 0);
        ctx.restore();
        ctx.globalAlpha = prevAlpha;
        return;
      }
    }

    ctx.globalAlpha = opacity * prevAlpha;
    this.strokeSegments(ctx, pts, angle, half, nibThickness, stepPx);
    ctx.globalAlpha = prevAlpha;
  }
}
