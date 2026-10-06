import { Path2D } from "@napi-rs/canvas";

(globalThis as unknown as { Path2D: unknown }).Path2D = Path2D;
