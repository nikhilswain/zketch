import { StampBrush } from "../stamp/StampBrush";

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

export const stampBrushes = [pencilBrush];
