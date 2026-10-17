import type { ICanvasModel } from "@/models/CanvasModel";
import { lastInputWasPen } from "@/utils/brushMemory";
import type { StrokeLook } from "./StrokeCanvas";

export function currentBrushLook(store: ICanvasModel): StrokeLook {
  const bs = store.brushSettings;
  return {
    brushStyle: store.currentBrushStyle,
    color: store.currentColor,
    size: store.currentSize,
    opacity: bs.opacity ?? 1,
    angle: bs.angle,
    softness: bs.softness,
    thinning: bs.thinning,
    smoothing: bs.smoothing,
    streamline: bs.streamline,
    taperStart: bs.taperStart,
    taperEnd: bs.taperEnd,
    input: lastInputWasPen() ? "pen" : "mouse",
  };
}
