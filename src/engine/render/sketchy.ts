import { RoughGenerator } from "roughjs/bin/generator";
import type { Drawable, Options } from "roughjs/bin/core";
import type { ShapeElementLike } from "../types";
import type { ResolvedArrow } from "../geometry/arrow";

const generator = new RoughGenerator();
const shapeCache = new WeakMap<object, { key: string; drawable: Drawable }>();
const curveCache = new WeakMap<object, { key: string; drawable: Drawable }>();

function draw(ctx: CanvasRenderingContext2D, drawable: Drawable) {
  for (const set of drawable.sets) {
    ctx.beginPath();
    for (const op of set.ops) {
      const d = op.data;
      if (op.op === "move") ctx.moveTo(d[0], d[1]);
      else if (op.op === "bcurveTo") ctx.bezierCurveTo(d[0], d[1], d[2], d[3], d[4], d[5]);
      else ctx.lineTo(d[0], d[1]);
    }
    if (set.type === "path") ctx.stroke();
    else ctx.fill();
  }
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (k === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
}

function baseOptions(seed: number, stroke: string, strokeWidth: number): Options {
  return {
    seed: seed || 1,
    roughness: 1.5,
    bowing: 1.4,
    stroke,
    strokeWidth,
    preserveVertices: false,
  };
}

function shapeDrawable(s: ShapeElementLike): Drawable {
  const opts: Options = {
    ...baseOptions(s.seed ?? 1, s.strokeColor, s.strokeWidth),
    ...(s.fillColor ? { fill: s.fillColor, fillStyle: "solid" } : {}),
  };
  const { x, y, width: w, height: h } = s;
  switch (s.shapeType) {
    case "circle":
      return generator.ellipse(x + w / 2, y + h / 2, w, h, opts);
    case "diamond":
      return generator.polygon(
        [
          [x + w / 2, y],
          [x + w, y + h / 2],
          [x + w / 2, y + h],
          [x, y + h / 2],
        ],
        opts,
      );
    case "triangle":
      return generator.polygon(
        [
          [x + w / 2, y],
          [x + w, y + h],
          [x, y + h],
        ],
        opts,
      );
    default:
      return generator.path(roundedRectPath(x, y, w, h, s.cornerRadius), opts);
  }
}

export function drawSketchyShape(ctx: CanvasRenderingContext2D, s: ShapeElementLike) {
  const key = `${s.shapeType}|${s.x}|${s.y}|${s.width}|${s.height}|${s.cornerRadius}|${s.strokeColor}|${s.strokeWidth}|${s.fillColor}|${s.seed}`;
  let hit = shapeCache.get(s);
  if (!hit || hit.key !== key) {
    hit = { key, drawable: shapeDrawable(s) };
    shapeCache.set(s, hit);
  }
  draw(ctx, hit.drawable);
}

export function drawSketchyCurve(
  ctx: CanvasRenderingContext2D,
  owner: object,
  r: ResolvedArrow,
  seed: number,
  stroke: string,
  strokeWidth: number,
) {
  const path = `M${r.start.x} ${r.start.y}Q${r.control.x} ${r.control.y} ${r.end.x} ${r.end.y}`;
  const key = `${path}|${stroke}|${strokeWidth}|${seed}`;
  let hit = curveCache.get(owner);
  if (!hit || hit.key !== key) {
    hit = { key, drawable: generator.path(path, baseOptions(seed, stroke, strokeWidth)) };
    curveCache.set(owner, hit);
  }
  draw(ctx, hit.drawable);
}
