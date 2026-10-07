import { StampBrush } from "../stamp/StampBrush";

const REVOY = "revoy-2025-01";
const frames = (name: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${REVOY}/${name}-${i}`);
const PAPER = `${REVOY}/paper-grain-b`;

export const pencilBrush = new StampBrush({
  key: "pencil",
  label: "Pencil",
  tips: ["round-hard"],
  spacing: 0.12,
  flow: 0.5,
  flowPressure: 0.6,
  flowJitter: 0.3,
  sizePressure: 0.35,
  sizeJitter: 0.15,
  scatter: 0.04,
  angleMode: "random",
  grain: { id: "paper-noise", scale: 0.35, depth: 0.85 },
  presets: [
    { id: "hb", label: "HB", size: 3, opacity: 0.9 },
    { id: "2b", label: "2B", size: 5, opacity: 1 },
    { id: "4h", label: "4H", size: 2, opacity: 0.6 },
    { id: "sketch", label: "Sketch", size: 9, opacity: 0.55 },
  ],
});

export const charcoalBrush = new StampBrush({
  key: "charcoal",
  label: "Charcoal",
  tips: frames("charcoal", 4),
  spacing: 0.16,
  flow: 0.8,
  flowPressure: 0.5,
  flowJitter: 0.25,
  sizePressure: 0.3,
  sizeJitter: 0.2,
  scatter: 0.05,
  angleMode: "direction",
  angleJitter: 0.35,
  grain: { id: PAPER, scale: 0.6, depth: 0.7 },
  presets: [
    { id: "soft", label: "Soft", size: 22, opacity: 0.85 },
    { id: "vine", label: "Vine", size: 10, opacity: 0.7 },
    { id: "compressed", label: "Compressed", size: 34, opacity: 1 },
  ],
});

export const pastelBrush = new StampBrush({
  key: "pastel",
  label: "Pastel",
  tips: [`${REVOY}/chalk`, `${REVOY}/chalk-sparse`],
  spacing: 0.14,
  flow: 0.8,
  flowPressure: 0.45,
  flowJitter: 0.2,
  sizePressure: 0.25,
  sizeJitter: 0.1,
  angleMode: "random",
  grain: { id: PAPER, scale: 0.5, depth: 0.9 },
  presets: [
    { id: "soft", label: "Soft Pastel", size: 26, opacity: 0.9 },
    { id: "chalk", label: "Chalk", size: 16, opacity: 1 },
    { id: "crayon", label: "Crayon", size: 10, opacity: 1 },
  ],
});

export const splatterBrush = new StampBrush({
  key: "splatter",
  label: "Splatter",
  tips: [...frames("splat", 5), `${REVOY}/splat-dots`],
  spacing: 1.1,
  flow: 1,
  sizeJitter: 0.45,
  scatter: 0.7,
  angleMode: "random",
  presets: [
    { id: "ink", label: "Ink Splats", size: 48, opacity: 1 },
    { id: "fine", label: "Fine Spray", size: 24, opacity: 0.9 },
    { id: "big", label: "Big Splash", size: 90, opacity: 1 },
  ],
});

export const dryBrush = new StampBrush({
  key: "drybrush",
  label: "Dry Brush",
  tips: [`${REVOY}/bristles`],
  spacing: 0.02,
  flow: 0.22,
  flowPressure: 0.6,
  flowJitter: 0.5,
  sizePressure: 0.25,
  angleMode: "direction",
  grain: { id: PAPER, scale: 0.7, depth: 0.75 },
  presets: [
    { id: "flat", label: "Flat", size: 40, opacity: 0.95 },
    { id: "scumble", label: "Scumble", size: 70, opacity: 0.7 },
    { id: "detail", label: "Detail", size: 18, opacity: 1 },
  ],
});

export const spongeBrush = new StampBrush({
  key: "sponge",
  label: "Sponge",
  tips: frames("sponge", 7),
  spacing: 0.3,
  flow: 0.75,
  flowPressure: 0.4,
  flowJitter: 0.3,
  sizeJitter: 0.25,
  scatter: 0.15,
  angleMode: "random",
  presets: [
    { id: "texture", label: "Texture", size: 60, opacity: 0.8 },
    { id: "foliage", label: "Foliage", size: 36, opacity: 1 },
    { id: "big", label: "Big Sponge", size: 110, opacity: 0.7 },
  ],
});

export const gouacheBrush = new StampBrush({
  key: "gouache",
  label: "Gouache",
  tips: [`${REVOY}/painterly`],
  spacing: 0.04,
  flow: 0.45,
  flowPressure: 0.5,
  flowJitter: 0.15,
  sizePressure: 0.35,
  angleMode: "direction",
  angle: Math.PI / 2,
  angleJitter: 0.05,
  roundness: 0.7,
  presets: [
    { id: "round", label: "Round", size: 30, opacity: 1 },
    { id: "wash", label: "Thin Wash", size: 50, opacity: 0.55 },
    { id: "detail", label: "Detail", size: 12, opacity: 1 },
  ],
});

export const stampBrushes = [
  pencilBrush,
  charcoalBrush,
  pastelBrush,
  gouacheBrush,
  dryBrush,
  spongeBrush,
  splatterBrush,
];
