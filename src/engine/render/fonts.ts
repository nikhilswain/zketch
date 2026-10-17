import type { FontFamilyId } from "../types";
import type { Measure } from "../geometry/textLayout";
import { createCanvas } from "./canvasFactory";

const FAMILY_NAMES: Record<FontFamilyId, string> = {
  hand: "Kalam",
  sans: "Instrument Sans",
  mono: "JetBrains Mono",
};

let measureCtx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
const requested = new Set<FontFamilyId>();
const listeners = new Set<() => void>();
let epoch = 0;
let watching = false;

export const fontEpoch = () => epoch;

function fontsChanged() {
  widths.clear();
  epoch++;
  listeners.forEach((cb) => cb());
}

function watch() {
  if (watching || typeof document === "undefined" || !document.fonts) return;
  watching = true;
  document.fonts.addEventListener("loadingdone", fontsChanged);
}

export const measureText: Measure = (font, text) => {
  const key = `${font}\u0000${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  measureCtx ??= createCanvas(1, 1).getContext("2d");
  if (!measureCtx) return text.length * 10;
  measureCtx.font = font;
  const w = measureCtx.measureText(text).width;
  widths.set(key, w);
  return w;
};

function loadFamily(f: FontFamilyId) {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return document.fonts
    .load(`24px "${FAMILY_NAMES[f]}"`)
    .then(() => undefined)
    .catch(() => undefined);
}

export function requestFont(f: FontFamilyId) {
  watch();
  if (requested.has(f)) return;
  requested.add(f);
  loadFamily(f);
}

export function ensureFonts(families: Iterable<FontFamilyId>, timeoutMs = 3000): Promise<void> {
  watch();
  const list = [...new Set(families)];
  if (list.length === 0) return Promise.resolve();
  list.forEach((f) => requested.add(f));
  const all = Promise.all(list.map(loadFamily)).then(() => undefined);
  const timeout = new Promise<void>((r) => setTimeout(r, timeoutMs));
  return Promise.race([all, timeout]).then(() => widths.clear());
}

export function fontFamiliesIn(layers: readonly { type: string; elements?: readonly any[] }[]): FontFamilyId[] {
  const out = new Set<FontFamilyId>();
  for (const l of layers) {
    if (l.type !== "draw" || !l.elements) continue;
    for (const el of l.elements) if (el?.kind === "text") out.add(el.fontFamily);
  }
  return [...out];
}

export function onFontsReady(cb: () => void): () => void {
  watch();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
