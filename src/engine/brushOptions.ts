import type { BrushOptions, BrushStyle } from "./types";

export interface BrushSettingsLike {
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
  easing: string;
  opacity?: number;
}

const easingFn = (name: string) => {
  switch (name) {
    case "easeIn":
      return (t: number) => t * t;
    case "easeOut":
      return (t: number) => 1 - Math.pow(1 - t, 2);
    case "easeInOut":
      return (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return (t: number) => t;
  }
};

export function createGetBrushOptions(brushSettings: BrushSettingsLike) {
  return function getBrushOptions(
    brushStyle: BrushStyle,
    size: number
  ): BrushOptions {
    const baseOptions: BrushOptions = {
      size,
      thinning: brushSettings.thinning,
      smoothing: brushSettings.smoothing,
      streamline: brushSettings.streamline,
    };

    switch (brushStyle) {
      case "ink":
        return {
          ...baseOptions,
          easing: easingFn(brushSettings.easing),
          start: {
            taper: brushSettings.taperStart,
            easing: easingFn(brushSettings.easing),
          },
          end: {
            taper: brushSettings.taperEnd,
            easing: easingFn(brushSettings.easing),
          },
        };
      case "eraser":
        return {
          ...baseOptions,
          thinning: 0.3,
          smoothing: 0.6,
          streamline: 0.6,
          start: { cap: true, taper: 0, easing: (t: number) => t },
          end: { cap: true, taper: 0, easing: (t: number) => t },
        };
      case "spray":
        return {
          ...baseOptions,
          thinning: 0.8,
          smoothing: 0.3,
          streamline: 0.3,
          start: { cap: false, taper: 0, easing: (t: number) => t },
          end: { cap: false, taper: 0, easing: (t: number) => t },
        };
      case "texture":
        return {
          ...baseOptions,
          thinning: 0.7,
          smoothing: 0.5,
          streamline: 0.5,
          start: { cap: false, taper: 10, easing: (t: number) => t },
          end: { cap: false, taper: 10, easing: (t: number) => t },
        };
      default:
        return baseOptions;
    }
  };
}
