import { Path2D, createCanvas } from "@napi-rs/canvas";
import { setCanvasFactory } from "@/engine/render/canvasFactory";

(globalThis as unknown as { Path2D: unknown }).Path2D = Path2D;
setCanvasFactory(
  (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
);
