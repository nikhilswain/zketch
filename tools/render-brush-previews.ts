import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Path2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { setCanvasFactory } from "../src/engine/render/canvasFactory";
import {
  brushRegistry,
  registerDefaultBrushes,
} from "../src/engine/render/BrushRegistry";
import { renderStroke } from "../src/engine/render/renderStroke";
import { registerTipMask } from "../src/engine/stamp/tips";
import { registerGrain } from "../src/engine/stamp/grain";
import { StampBrush } from "../src/engine/stamp/StampBrush";
import type { StrokeLike } from "../src/engine/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRUSHES = join(ROOT, "public", "brushes");
const OUT = join(BRUSHES, "previews");
const W = 140;
const H = 40;
const DENSITY = 2;

(globalThis as unknown as { Path2D: unknown }).Path2D = Path2D;
setCanvasFactory(
  (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
);

async function readCanvas(file: string) {
  const img = await loadImage(file);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas;
}

async function loadAssets(brush: StampBrush) {
  for (const id of brush.spec.tips) {
    const file = join(BRUSHES, `${id}.png`);
    if (existsSync(file)) registerTipMask(id, (await readCanvas(file)) as never);
  }
  const grain = brush.spec.grain?.id;
  const file = grain && join(BRUSHES, `${grain}.png`);
  if (grain && file && existsSync(file)) {
    const canvas = await readCanvas(file);
    const size = Math.min(canvas.width, canvas.height);
    const data = canvas.getContext("2d").getImageData(0, 0, size, size).data;
    const values = new Float32Array(size * size);
    for (let i = 0; i < values.length; i++) values[i] = data[i * 4] / 255;
    registerGrain(grain, values, size);
  }
}

async function main() {
  registerDefaultBrushes();
  mkdirSync(OUT, { recursive: true });
  let count = 0;
  for (const brush of brushRegistry.all()) {
    if (brush.legacy) continue;
    if (brush instanceof StampBrush) await loadAssets(brush);
    const big =
      brush.category === "nature" ||
      brush.category === "effects" ||
      brush.key === "dust" ||
      brush.key === "clouds";
    const preset = brush.presets?.[0];
    const points: StrokeLike["points"] = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      points.push({
        x: 10 + t * (W - 20),
        y: H / 2 + (big ? 4 : 0) + Math.sin(t * Math.PI * 2) * (big ? 3 : 8),
        pressure: 0.2 + 0.75 * Math.sin(t * Math.PI),
      });
    }
    const canvas = createCanvas(W * DENSITY, H * DENSITY);
    const ctx = canvas.getContext("2d");
    ctx.scale(DENSITY, DENSITY);
    renderStroke(
      ctx as never,
      {
        id: `preview-${brush.key}`,
        points,
        color: "#1d1f24",
        size: Math.min(preset?.size ?? 6, big ? 26 : 13),
        opacity: preset?.opacity ?? 1,
        brushStyle: brush.key as StrokeLike["brushStyle"],
        timestamp: 0,
        angle: preset?.angle,
        softness: preset?.softness,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0,
        taperStart: 0,
        taperEnd: 0,
        input: "pen",
      },
      brushRegistry,
    );
    writeFileSync(join(OUT, `${brush.key}.png`), canvas.toBuffer("image/png"));
    count++;
  }
  console.log(`Wrote ${count} brush previews to public/brushes/previews/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
