import type { StrokeLike } from "@/engine/types";
import { createCanvas } from "@/engine/render/canvasFactory";
import { renderStroke } from "@/engine/render/renderStroke";
import { landingRegistry } from "./engine";
import { mulberry, type Doodle, type Pt } from "./doodles/library";

const BOIL_FRAMES = 3;

function eraserPath(w: number, h: number): Pt[] {
  const rows = 6;
  const out: Pt[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = -h * 0.04 + (h * 1.08 * i) / rows;
    out.push(i % 2 ? { x: w * 1.04, y } : { x: -w * 0.04, y });
  }
  return out;
}

function pathLength(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return acc;
}

export class DoodlePlayer {
  readonly doodle: Doodle;
  readonly cssWidth: number;
  private ctx: CanvasRenderingContext2D;
  private done: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private committed = 0;
  private frames: HTMLCanvasElement[] = [];
  private dpr: number;
  private k: number;
  private ox: number;
  private oy: number;
  private eraser: Pt[];
  private eraserLen: number[];

  constructor(
    private canvas: HTMLCanvasElement,
    doodle: Doodle,
    cssW: number,
    cssH = cssW,
  ) {
    this.doodle = doodle;
    this.cssWidth = cssW;
    this.dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.ctx = canvas.getContext("2d")!;
    this.done = createCanvas(canvas.width, canvas.height);
    this.dctx = this.done.getContext("2d")!;
    this.k = Math.min(canvas.width / doodle.w, canvas.height / doodle.h) * 0.88;
    this.ox = (canvas.width - doodle.w * this.k) / 2;
    this.oy = (canvas.height - doodle.h * this.k) / 2;
    this.eraser = eraserPath(doodle.w, doodle.h);
    this.eraserLen = pathLength(this.eraser);
  }

  get finished(): boolean {
    return this.committed >= this.doodle.strokes.length;
  }

  private paint(ctx: CanvasRenderingContext2D, s: StrokeLike) {
    ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy);
    renderStroke(ctx, s, landingRegistry());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private commit(upTo: number) {
    const strokes = this.doodle.strokes;
    while (this.committed < upTo && this.committed < strokes.length) this.paint(this.dctx, strokes[this.committed++]);
  }

  private show(src: HTMLCanvasElement) {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(src, 0, 0);
  }

  renderAt(ms: number): boolean {
    const strokes = this.doodle.strokes;
    let i = this.committed;
    while (i < strokes.length && strokes[i].startTime! + strokes[i].duration! <= ms) i++;
    this.commit(i);
    this.show(this.done);
    const s = strokes[this.committed];
    if (s && ms > s.startTime!) {
      const f = (ms - s.startTime!) / s.duration!;
      const n = Math.max(2, Math.ceil(s.points.length * f));
      this.paint(this.ctx, { ...s, id: `${s.id}~${n}`, points: s.points.slice(0, n) });
    }
    return this.finished;
  }

  finish(): void {
    this.commit(this.doodle.strokes.length);
    this.show(this.done);
  }

  bakeNext(): boolean {
    if (!this.finished) return false;
    if (this.frames.length >= BOIL_FRAMES) return true;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const rand = mulberry(this.frames.length * 977 + this.doodle.strokes.length);
    const amp = 0.9 * this.dpr;
    const strip = Math.max(2, Math.round(3 * this.dpr));
    const p = [rand(), rand(), rand(), rand()].map((v) => v * Math.PI * 2);
    const l1 = (15 + rand() * 8) * this.dpr;
    const l2 = (6 + rand() * 3) * this.dpr;
    const mid = createCanvas(w, h);
    const mctx = mid.getContext("2d")!;
    for (let y = 0; y < h; y += strip) {
      const dx = amp * (Math.sin(y / l1 + p[0]) + 0.5 * Math.sin(y / l2 + p[1]));
      mctx.drawImage(this.done, 0, y, w, strip, dx, y, w, strip);
    }
    const out = createCanvas(w, h);
    const octx = out.getContext("2d")!;
    for (let x = 0; x < w; x += strip) {
      const dy = amp * (Math.sin(x / l1 + p[2]) + 0.5 * Math.sin(x / l2 + p[3]));
      octx.drawImage(mid, x, 0, strip, h, x, dy, strip, h);
    }
    this.frames.push(out);
    return this.frames.length >= BOIL_FRAMES;
  }

  boil(frame: number): void {
    if (!this.frames.length) return;
    this.show(this.frames[frame % this.frames.length]);
  }

  erase(p: number): Pt {
    this.show(this.done);
    const total = this.eraserLen[this.eraserLen.length - 1];
    const target = total * Math.min(1, Math.max(0, p));
    let i = 1;
    while (i < this.eraser.length - 1 && this.eraserLen[i] < target) i++;
    const a = this.eraser[i - 1];
    const b = this.eraser[i];
    const seg = this.eraserLen[i] - this.eraserLen[i - 1] || 1;
    const t = Math.min(1, (target - this.eraserLen[i - 1]) / seg);
    const head = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const pts = [...this.eraser.slice(0, i), head];
    if (target > 0) {
      const dense: Pt[] = [];
      for (let j = 1; j < pts.length; j++) {
        const s = pts[j - 1];
        const e = pts[j];
        const n = Math.max(1, Math.ceil(Math.hypot(e.x - s.x, e.y - s.y) / 6));
        for (let q = 0; q < n; q++) dense.push({ x: s.x + ((e.x - s.x) * q) / n, y: s.y + ((e.y - s.y) * q) / n });
      }
      dense.push(head);
      this.paint(this.ctx, {
        id: "eraser",
        points: dense.map((d) => ({ ...d, pressure: 1 })),
        color: "#000",
        size: this.doodle.h / 4,
        brushStyle: "eraser",
        timestamp: 0,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.3,
      });
    }
    return { x: (this.ox + head.x * this.k) / this.dpr, y: (this.oy + head.y * this.k) / this.dpr };
  }

  rebake(): void {
    const keep = this.committed;
    this.dctx.setTransform(1, 0, 0, 1, 0, 0);
    this.dctx.clearRect(0, 0, this.done.width, this.done.height);
    this.committed = 0;
    this.commit(keep);
    this.frames = [];
    if (this.finished) this.show(this.done);
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
