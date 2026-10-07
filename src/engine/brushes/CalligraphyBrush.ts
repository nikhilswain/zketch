import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const MAX_STAMPS = 6000;

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
    const nibThickness = Math.max(0.75, stroke.size * 0.1);
    const halfT = nibThickness / 2;
    const step = Math.max(0.4, nibThickness * 0.4);

    const nibHalf = (pressure: number) => half * (0.35 + 0.65 * pressure);

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    ctx.fillStyle = stroke.color;

    ctx.beginPath();
    let stamps = 0;
    const stamp = (x: number, y: number, h: number) => {
      if (stamps >= MAX_STAMPS) return;
      stamps++;
      ctx.moveTo(x + nx * h, y + ny * h);
      ctx.ellipse(x, y, h, halfT, angle, 0, Math.PI * 2);
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
        const pressure = (a.pressure ?? 1) * (1 - t) + (b.pressure ?? 1) * t;
        stamp(a.x + dx * t, a.y + dy * t, nibHalf(pressure));
      }
    }
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }
}
