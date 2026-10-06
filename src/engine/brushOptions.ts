import type { BrushOptions, BrushStyle } from "./types";
import { easingFn } from "./easing";
import { brushRegistry } from "./render/BrushRegistry";

export interface BrushSettingsLike {
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
  easing: string;
  opacity?: number;
  angle: number;
  softness: number;
}

export function createGetBrushOptions(brushSettings: BrushSettingsLike) {
  const ease = easingFn(brushSettings.easing);
  return function getBrushOptions(
    brushStyle: BrushStyle,
    size: number,
  ): BrushOptions {
    const defaults = brushRegistry.get(brushStyle)?.defaults ?? {};
    const baseOptions: BrushOptions = {
      size,
      thinning: brushSettings.thinning,
      smoothing: brushSettings.smoothing,
      streamline: brushSettings.streamline,
      angle: brushSettings.angle,
      softness: brushSettings.softness,
    };

    if (brushStyle === "ink") {
      return {
        ...baseOptions,
        easing: ease,
        start: { taper: brushSettings.taperStart, easing: ease },
        end: { taper: brushSettings.taperEnd, easing: ease },
        ...defaults,
      };
    }

    return {
      ...baseOptions,
      ...defaults,
    };
  };
}
