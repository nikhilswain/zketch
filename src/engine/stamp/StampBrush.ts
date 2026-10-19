import type {
  Brush,
  BrushCategory,
  BrushOptions,
  BrushPreset,
  StrokeDefaults,
  StrokeLike,
  StrokeSettingKey,
} from "../types";
import { hashString, seededRandom } from "../render/seededRandom";
import { createCanvas } from "../render/canvasFactory";
import { getTintedTip } from "./tips";
import { getGrainMask } from "./grain";
import {
  dynamicPoints,
  hasDynamics,
  pressureGain,
  taperFactor,
} from "../render/dynamics";

export interface StampSpec {
  key: string;
  label: string;
  category?: BrushCategory;
  maxSize?: number;
  tips: readonly string[];
  spacing: number;
  flow: number;
  count?: number;
  scatter?: number;
  scatterBothAxes?: boolean;
  keepAspect?: boolean;
  flip?: boolean;
  sizeJitter?: number;
  sizePressure?: number;
  flowJitter?: number;
  flowPressure?: number;
  angleMode?: "fixed" | "direction" | "random";
  angle?: number;
  directionOffset?: number;
  followCurve?: boolean;
  strokeSettings?: StrokeSettingKey[];
  strokeDefaults?: Partial<StrokeDefaults>;
  angleJitter?: number;
  roundness?: number;
  grain?: { id: string; scale: number; depth: number };
  presets?: BrushPreset[];
}

interface StampPoint {
  x: number;
  y: number;
  pressure: number;
}

interface WalkState {
  segment: number;
  carry: number;
  dabs: number;
  lastDir?: number;
  travelled?: number;
}

type Matrix = [number, number, number, number, number, number];

interface LiveCache {
  id: string;
  brush: string;
  canvas: HTMLCanvasElement;
  matrix: Matrix;
  rawCount: number;
  state: WalkState;
  accum: HTMLCanvasElement;
}

const MAX_DABS = 20000;
const SMOOTH_PASSES = 2;

let buffer: HTMLCanvasElement | null = null;
let live: LiveCache | null = null;

function ensureCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
) {
  if (!canvas) return createCanvas(width, height);
  if (canvas.width < width || canvas.height < height) {
    canvas.width = Math.max(canvas.width, width);
    canvas.height = Math.max(canvas.height, height);
  }
  return canvas;
}

function pathLength(pts: readonly StampPoint[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

export function stampSmooth(
  points: readonly { x: number; y: number; pressure?: number }[],
): StampPoint[] {
  let cur = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure ?? 0.5,
  }));
  if (cur.length < 3) return cur;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
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

export class StampBrush implements Brush {
  readonly key: string;
  readonly label: string;
  readonly category?: BrushCategory;
  readonly maxSize?: number;
  readonly strokeSettings?: StrokeSettingKey[];
  readonly strokeDefaults?: Partial<StrokeDefaults>;
  readonly presets?: BrushPreset[];

  constructor(readonly spec: StampSpec) {
    this.key = spec.key;
    this.label = spec.label;
    this.category = spec.category;
    this.maxSize = spec.maxSize;
    this.strokeSettings = spec.strokeSettings;
    this.strokeDefaults = spec.strokeDefaults;
    this.presets = spec.presets;
  }

  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    _options?: BrushOptions,
  ) {
    if (stroke.points.length === 0) return;
    const t = ctx.getTransform();
    const matrix: Matrix = [t.a, t.b, t.c, t.d, t.e, t.f];
    if (stroke.live) {
      this.renderLive(ctx, stroke, matrix);
    } else {
      this.renderFull(ctx, stroke, matrix);
    }
  }

  private reuseLive(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    pts: StampPoint[],
    m: Matrix,
    deviceBounds: { x0: number; y0: number; x1: number; y1: number },
  ) {
    if (hasDynamics(stroke) && (stroke.taperEnd ?? 0) > 0) return false;
    const cache = live;
    if (!cache || cache.id !== stroke.id || cache.brush !== this.key) return false;
    if (cache.rawCount > stroke.points.length) return false;
    const lm = cache.matrix;
    if (lm[0] !== m[0] || lm[1] !== m[1] || lm[2] !== m[2] || lm[3] !== m[3]) {
      return false;
    }
    const dx = m[4] - lm[4];
    const dy = m[5] - lm[5];
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return false;
    const cw = cache.canvas.width;
    const ch = cache.canvas.height;
    if (
      deviceBounds.x0 - dx < 0 ||
      deviceBounds.y0 - dy < 0 ||
      deviceBounds.x1 - dx > cw ||
      deviceBounds.y1 - dy > ch
    ) {
      return false;
    }
    buffer = ensureCanvas(buffer, cw, ch);
    const bctx = buffer.getContext("2d")!;
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, cw, ch);
    bctx.drawImage(cache.accum, 0, 0, cw, ch, 0, 0, cw, ch);
    this.walk(bctx, stroke, pts, lm, { ...cache.state }, pts.length, pathLength(pts));
    this.applyGrain(bctx, lm, cw, ch);
    bctx.restore();
    this.composite(ctx, stroke, buffer, dx, dy, cw, ch);
    live = null;
    return true;
  }

  private renderFull(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    m: Matrix,
  ) {
    const pts = stampSmooth(dynamicPoints(stroke));
    const size = Math.max(0.5, stroke.size);
    const scale = Math.hypot(m[0], m[1]) || 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const reach = (this.spec.scatter ?? 0) * (this.spec.scatterBothAxes ? 1.42 : 1);
    const pad = size * (0.75 + reach) + 2 / scale;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [x, y] of [
      [minX - pad, minY - pad],
      [maxX + pad, minY - pad],
      [minX - pad, maxY + pad],
      [maxX + pad, maxY + pad],
    ]) {
      xs.push(m[0] * x + m[2] * y + m[4]);
      ys.push(m[1] * x + m[3] * y + m[5]);
    }
    const bx = Math.max(0, Math.floor(Math.min(...xs)));
    const by = Math.max(0, Math.floor(Math.min(...ys)));
    const bw = Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs))) - bx;
    const bh = Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys))) - by;
    if (bw <= 0 || bh <= 0) return;
    if (
      this.reuseLive(ctx, stroke, pts, m, {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      })
    ) {
      return;
    }

    buffer = ensureCanvas(buffer, bw, bh);
    const bctx = buffer.getContext("2d")!;
    const local: Matrix = [m[0], m[1], m[2], m[3], m[4] - bx, m[5] - by];
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.clearRect(0, 0, bw, bh);
    this.walk(
      bctx,
      stroke,
      pts,
      local,
      { segment: 1, carry: 0, dabs: 0 },
      pts.length,
      pathLength(pts),
    );
    this.applyGrain(bctx, local, bw, bh);
    bctx.restore();
    this.composite(ctx, stroke, buffer, bx, by, bw, bh);
  }

  private renderLive(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    m: Matrix,
  ) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const raw = stroke.points;
    const reusable =
      live &&
      live.id === stroke.id &&
      live.brush === this.key &&
      live.canvas === ctx.canvas &&
      live.rawCount <= raw.length &&
      live.matrix.every((v, i) => v === m[i]);
    if (!reusable) {
      const accum = ensureCanvas(live?.accum ?? null, cw, ch);
      const actx = accum.getContext("2d")!;
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, accum.width, accum.height);
      live = {
        id: stroke.id,
        brush: this.key,
        canvas: ctx.canvas,
        matrix: m,
        rawCount: 0,
        state: { segment: 1, carry: 0, dabs: 0 },
        accum,
      };
    }
    const cache = live!;
    const pts = stampSmooth(dynamicPoints(stroke));
    const settledPoints = Math.max(0, pts.length - SMOOTH_PASSES - 1);

    const actx = cache.accum.getContext("2d")!;
    actx.save();
    cache.state = this.walk(
      actx,
      stroke,
      pts,
      m,
      cache.state,
      settledPoints,
      Infinity,
    );
    actx.restore();
    cache.rawCount = raw.length;

    buffer = ensureCanvas(buffer, cw, ch);
    const bctx = buffer.getContext("2d")!;
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, cw, ch);
    bctx.drawImage(cache.accum, 0, 0, cw, ch, 0, 0, cw, ch);
    this.walk(bctx, stroke, pts, m, { ...cache.state }, pts.length, pathLength(pts));
    this.applyGrain(bctx, m, cw, ch);
    bctx.restore();
    this.composite(ctx, stroke, buffer, 0, 0, cw, ch);
  }

  private walk(
    bctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    pts: StampPoint[],
    m: Matrix,
    start: WalkState,
    endPoint: number,
    totalLength: number,
  ): WalkState {
    const spec = this.spec;
    const size = Math.max(0.5, stroke.size);
    const scatter = spec.scatter ?? 0;
    const roundness = spec.roundness ?? 1;
    const scale = Math.hypot(m[0], m[1]) || 1;
    const minStep = 0.5 / scale;
    const seed = hashString(stroke.id || "stroke");
    const rand = (i: number, k: number) =>
      seededRandom(seed + i * 7.137 + k * 0.917);
    const tips = spec.tips.map((id) => getTintedTip(id, stroke.color));
    const count = Math.max(1, Math.round(spec.count ?? 1));
    const gain = pressureGain(stroke);
    const sizeK = (spec.sizePressure ?? 0) * gain;
    const flowK = (spec.flowPressure ?? 0) * gain;
    const tapered =
      hasDynamics(stroke) &&
      ((stroke.taperStart ?? 0) > 0 || (stroke.taperEnd ?? 0) > 0);

    const placeOne = (
      r: (k: number) => number,
      x: number,
      y: number,
      pressure: number,
      dir: number,
      taper: number,
    ) => {
      const diameter =
        size *
        Math.max(0, 1 - sizeK * (1 - pressure)) *
        (1 - (spec.sizeJitter ?? 0) * r(1)) *
        taper;
      const flow =
        spec.flow *
        Math.max(0, 1 - flowK * (1 - pressure)) *
        (1 - (spec.flowJitter ?? 0) * r(2));
      if (diameter <= 0 || flow <= 0) return;
      let angle =
        spec.angleMode === "direction"
          ? dir + (spec.directionOffset ?? 0)
          : spec.angleMode === "random"
            ? r(3) * Math.PI * 2
            : (spec.angle ?? 0);
      angle += (spec.angleJitter ?? 0) * (r(4) * 2 - 1);
      if (scatter > 0) {
        const off = (r(5) * 2 - 1) * scatter * diameter;
        x += -Math.sin(dir) * off;
        y += Math.cos(dir) * off;
        if (spec.scatterBothAxes) {
          const along = (r(7) * 2 - 1) * scatter * diameter;
          x += Math.cos(dir) * along;
          y += Math.sin(dir) * along;
        }
      }
      const tip =
        tips.length === 1 ? tips[0] : tips[Math.floor(r(6) * tips.length)];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const fit = spec.keepAspect
        ? diameter / Math.max(tip.width, tip.height)
        : 0;
      let sx = fit || diameter / tip.width;
      const sy = (fit || diameter / tip.height) * roundness;
      if (spec.flip && r(8) < 0.5) sx = -sx;
      const da = cos * sx;
      const db = sin * sx;
      const dc = -sin * sy;
      const dd = cos * sy;
      bctx.setTransform(
        m[0] * da + m[2] * db,
        m[1] * da + m[3] * db,
        m[0] * dc + m[2] * dd,
        m[1] * dc + m[3] * dd,
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
      );
      bctx.globalAlpha = Math.min(1, flow);
      bctx.drawImage(tip, -tip.width / 2, -tip.height / 2);
    };

    const placeDab = (
      i: number,
      x: number,
      y: number,
      pressure: number,
      dir: number,
      taper = 1,
    ) => {
      for (let c = 0; c < count; c++) {
        placeOne((k) => rand(i, k + c * 16), x, y, pressure, dir, taper);
      }
    };

    const follow = spec.followCurve && spec.angleMode === "direction";
    const unit = (x: number, y: number) => {
      const l = Math.hypot(x, y);
      return l > 0 ? [x / l, y / l] : [0, 0];
    };
    const vertexDir = (k: number) => {
      const [ix, iy] =
        k > 0 ? unit(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y) : [0, 0];
      const [ox, oy] =
        k < pts.length - 1
          ? unit(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y)
          : [0, 0];
      const sx = ix + ox;
      const sy = iy + oy;
      if (sx === 0 && sy === 0) return Math.atan2(oy || iy, ox || ix);
      return Math.atan2(sy, sx);
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

    const state = { ...start };
    if (pts.length === 1) {
      if (state.dabs === 0 && endPoint >= 1) {
        placeDab(0, pts[0].x, pts[0].y, pts[0].pressure, 0);
        state.dabs = 1;
        state.segment = 1;
      }
      return state;
    }
    for (
      ;
      state.segment < Math.min(endPoint, pts.length) && state.dabs < MAX_DABS;
      state.segment++
    ) {
      const p0 = pts[state.segment - 1];
      const p1 = pts[state.segment];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const segDir = Math.atan2(dy, dx);
      const d0 = follow ? vertexDir(state.segment - 1) : segDir;
      const turn = follow ? wrap(vertexDir(state.segment) - d0) : 0;
      while (state.carry <= len && state.dabs < MAX_DABS) {
        const u = state.carry / len;
        const pressure = p0.pressure + (p1.pressure - p0.pressure) * u;
        const x = p0.x + dx * u;
        const y = p0.y + dy * u;
        const along = (state.travelled ?? 0) + state.carry;
        const taper = tapered
          ? taperFactor(
              along,
              totalLength - along,
              stroke.taperStart ?? 0,
              stroke.taperEnd ?? 0,
            )
          : 1;
        const step = Math.max(
          minStep,
          spec.spacing * size * Math.max(0, 1 - sizeK * (1 - pressure)) * taper,
        );
        let dir = segDir;
        if (follow) {
          dir = d0 + turn * u;
          if (state.lastDir !== undefined) {
            const delta = wrap(dir - state.lastDir);
            const fill = Math.ceil((Math.abs(delta) * size * 0.5) / step);
            for (let k = 1; k < fill && state.dabs < MAX_DABS; k++) {
              placeDab(
                state.dabs,
                x,
                y,
                pressure,
                state.lastDir + (delta * k) / fill,
                taper,
              );
              state.dabs++;
            }
          }
          state.lastDir = dir;
        }
        placeDab(state.dabs, x, y, pressure, dir, taper);
        state.dabs++;
        state.carry += step;
      }
      state.carry -= len;
      state.travelled = (state.travelled ?? 0) + len;
    }
    return state;
  }

  private applyGrain(
    bctx: CanvasRenderingContext2D,
    m: Matrix,
    width: number,
    height: number,
  ) {
    const grain = this.spec.grain;
    if (!grain) return;
    const pattern = bctx.createPattern(
      getGrainMask(grain.id, grain.depth),
      "repeat",
    );
    if (!pattern) return;
    const g = grain.scale;
    pattern.setTransform?.({
      a: m[0] * g,
      b: m[1] * g,
      c: m[2] * g,
      d: m[3] * g,
      e: m[4],
      f: m[5],
    } as DOMMatrix2DInit);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = "destination-in";
    bctx.fillStyle = pattern;
    bctx.fillRect(0, 0, width, height);
  }

  private composite(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    source: HTMLCanvasElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const alpha = ctx.globalAlpha;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * Math.max(0, Math.min(1, stroke.opacity ?? 1));
    ctx.drawImage(source, 0, 0, width, height, x, y, width, height);
    ctx.restore();
  }
}
