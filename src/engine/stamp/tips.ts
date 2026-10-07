import { createCanvas } from "../render/canvasFactory";

const TIP_SIZE = 128;
const MAX_TINTED = 96;

const masks = new Map<string, HTMLCanvasElement>();
const tinted = new Map<string, HTMLCanvasElement>();
const fallbacks = new Map<string, HTMLCanvasElement>();
let loader: ((id: string) => void) | null = null;

export function setTipLoader(next: ((id: string) => void) | null) {
  loader = next;
}

function proceduralTip(id: string): HTMLCanvasElement {
  const canvas = createCanvas(TIP_SIZE, TIP_SIZE);
  const ctx = canvas.getContext("2d")!;
  const r = TIP_SIZE / 2;
  const hardness = id === "round-hard" ? 0.9 : id === "round-medium" ? 0.55 : 0;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  if (hardness > 0) g.addColorStop(hardness, "rgba(255,255,255,1)");
  g.addColorStop(Math.min(1, hardness + (1 - hardness) * 0.5), "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TIP_SIZE, TIP_SIZE);
  return canvas;
}

export function registerTipMask(id: string, mask: HTMLCanvasElement) {
  masks.set(id, mask);
  for (const key of [...tinted.keys()]) {
    if (key.startsWith(id + "|")) tinted.delete(key);
  }
}

export function hasTipMask(id: string) {
  return masks.has(id);
}

export function getTipMask(id: string): HTMLCanvasElement {
  const mask = masks.get(id);
  if (mask) return mask;
  if (id.startsWith("round-")) {
    const procedural = proceduralTip(id);
    masks.set(id, procedural);
    return procedural;
  }
  loader?.(id);
  let fallback = fallbacks.get("round-soft");
  if (!fallback) {
    fallback = proceduralTip("round-soft");
    fallbacks.set("round-soft", fallback);
  }
  return fallback;
}

export function getTintedTip(id: string, color: string): HTMLCanvasElement {
  const key = `${id}|${color}`;
  const hit = tinted.get(key);
  if (hit) {
    tinted.delete(key);
    tinted.set(key, hit);
    return hit;
  }
  const mask = getTipMask(id);
  const canvas = createCanvas(mask.width, mask.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tinted.set(key, canvas);
  if (tinted.size > MAX_TINTED) {
    const oldest = tinted.keys().next().value;
    if (oldest !== undefined) tinted.delete(oldest);
  }
  return canvas;
}
