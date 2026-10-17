import type {
  Brush,
  BrushOptions,
  BrushPreset,
  StrokeLike,
  StrokeSettingKey,
} from "../types";
import { smoothPoints } from "../render/smooth";
import {
  dynamicPoints,
  hasDynamics,
  pressureGain,
  taperFactor,
} from "../render/dynamics";

export class CalligraphyBrush implements Brush {
  key = "calligraphy" as const;
  label = "Calligraphy";
  category = "draw" as const;
  strokeSettings: StrokeSettingKey[] = ["variation", "stabilizer", "taper"];
  presets: BrushPreset[] = [
    { id: "italic", label: "Italic", size: 28, opacity: 1, angle: 30 },
    { id: "classic", label: "Classic", size: 28, opacity: 1, angle: 45 },
    { id: "flat", label: "Flat", size: 28, opacity: 1, angle: 0 },
    { id: "upright", label: "Upright", size: 28, opacity: 1, angle: 90 },
  ];

  private taper(pts: ReturnType<typeof smoothPoints>, stroke: StrokeLike) {
    const start = stroke.taperStart ?? 0;
    const end = stroke.taperEnd ?? 0;
    if (start <= 0 && end <= 0) return null;
    const along = [0];
    for (let i = 1; i < pts.length; i++) {
      along.push(
        along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
      );
    }
    const total = along[along.length - 1];
    return along.map((d) => taperFactor(d, total - d, start, end));
  }

  private sweep(
    ctx: CanvasRenderingContext2D,
    pts: ReturnType<typeof smoothPoints>,
    angle: number,
    half: number,
    thickness: number,
    stroke: StrokeLike,
  ) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dynamic = hasDynamics(stroke);
    const gain = pressureGain(stroke);
    const taper = dynamic ? this.taper(pts, stroke) : null;
    const nib = pts.map((p, i) => {
      let h = dynamic
        ? half * Math.max(0.15, 1 - 0.65 * gain * (1 - p.pressure))
        : half * (0.35 + 0.65 * p.pressure);
      if (taper) h *= taper[i];
      return { x: cos * h, y: sin * h };
    });

    ctx.beginPath();
    if (pts.length === 1) {
      const p = pts[0];
      const n = nib[0];
      const tx = -sin * (thickness / 2);
      const ty = cos * (thickness / 2);
      ctx.moveTo(p.x - n.x - tx, p.y - n.y - ty);
      ctx.lineTo(p.x + n.x - tx, p.y + n.y - ty);
      ctx.lineTo(p.x + n.x + tx, p.y + n.y + ty);
      ctx.lineTo(p.x - n.x + tx, p.y - n.y + ty);
      ctx.closePath();
      ctx.fill();
      return;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const na = nib[i];
      const nb = nib[i + 1];
      const quad = [
        [a.x - na.x, a.y - na.y],
        [a.x + na.x, a.y + na.y],
        [b.x + nb.x, b.y + nb.y],
        [b.x - nb.x, b.y - nb.y],
      ];
      let area = 0;
      for (let k = 0; k < 4; k++) {
        const [x0, y0] = quad[k];
        const [x1, y1] = quad[(k + 1) % 4];
        area += x0 * y1 - x1 * y0;
      }
      if (area < 0) quad.reverse();
      ctx.moveTo(quad[0][0], quad[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(quad[k][0], quad[k][1]);
      ctx.closePath();
    }
    ctx.fill("nonzero");

    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions,
  ) {
    const raw = dynamicPoints(stroke);
    if (raw.length === 0) return;
    const pts = smoothPoints(raw);

    const angle = ((stroke.angle ?? options?.angle ?? 45) * Math.PI) / 180;
    const half = stroke.size / 2;
    const thickness = Math.max(1, stroke.size * 0.1);
    const opacity = stroke.opacity ?? 1;
    const prevAlpha = ctx.globalAlpha;

    const canOffscreen = opacity < 1 && typeof document !== "undefined";
    if (canOffscreen) {
      const canvas = ctx.canvas;
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d");
      if (octx) {
        octx.setTransform(ctx.getTransform());
        octx.fillStyle = stroke.color;
        octx.strokeStyle = stroke.color;
        this.sweep(octx, pts, angle, half, thickness, stroke);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = opacity * prevAlpha;
        ctx.drawImage(off, 0, 0);
        ctx.restore();
        ctx.globalAlpha = prevAlpha;
        return;
      }
    }

    ctx.fillStyle = stroke.color;
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = opacity * prevAlpha;
    this.sweep(ctx, pts, angle, half, thickness, stroke);
    ctx.globalAlpha = prevAlpha;
  }
}
