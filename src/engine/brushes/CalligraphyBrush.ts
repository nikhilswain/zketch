import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const MAX_STAMPS = 4000;

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
    const thickness = Math.max(1, stroke.size * 0.12);
    const step = Math.max(0.5, thickness * 0.5);

    const nibHalf = (pressure: number) => half * (0.35 + 0.65 * pressure);

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineWidth = thickness;

    ctx.beginPath();
    let stamps = 0;
    const stamp = (x: number, y: number, h: number) => {
      if (stamps >= MAX_STAMPS) return;
      stamps++;
      ctx.moveTo(x - nx * h, y - ny * h);
      ctx.lineTo(x + nx * h, y + ny * h);
    };

    const p0 = pts[0];
    stamp(p0.x, p0.y, nibHalf(p0.pressure ?? 1));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const pressure =
          (a.pressure ?? 1) * (1 - t) + (b.pressure ?? 1) * t;
        stamp(a.x + dx * t, a.y + dy * t, nibHalf(pressure));
      }
    }
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
  }
}
