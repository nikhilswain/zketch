import type { Brush, BrushOptions, BrushPreset, StrokeLike } from "../types";

const MAX_STAMPS = 6000;

interface P {
  x: number;
  y: number;
  pressure: number;
}

function smoothPoints(points: readonly { x: number; y: number; pressure?: number }[]): P[] {
  let cur: P[] = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure ?? 1,
  }));
  if (cur.length < 5) return cur;
  const passes = Math.min(4, Math.floor(cur.length / 8));
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.map((p) => ({ ...p }));
    for (let i = 1; i < cur.length - 1; i++) {
      next[i].x = (cur[i - 1].x + 2 * cur[i].x + cur[i + 1].x) / 4;
      next[i].y = (cur[i - 1].y + 2 * cur[i].y + cur[i + 1].y) / 4;
      next[i].pressure =
        (cur[i - 1].pressure + 2 * cur[i].pressure + cur[i + 1].pressure) / 4;
    }
    cur = next;
  }
  return cur;
}

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
    const raw = stroke.points;
    if (raw.length === 0) return;
    const pts = smoothPoints(raw);

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
    const a0 = angle + Math.PI / 2;
    const capX = Math.cos(a0) * halfT;
    const capY = Math.sin(a0) * halfT;
    const stamp = (x: number, y: number, h: number) => {
      if (stamps >= MAX_STAMPS) return;
      stamps++;
      const ax = x - nx * h;
      const ay = y - ny * h;
      const bx = x + nx * h;
      const by = y + ny * h;
      ctx.moveTo(ax + capX, ay + capY);
      ctx.arc(ax, ay, halfT, a0, a0 + Math.PI, false);
      ctx.lineTo(bx - capX, by - capY);
      ctx.arc(bx, by, halfT, a0 + Math.PI, a0 + Math.PI * 2, false);
      ctx.closePath();
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
