import { FreehandBrush } from "../brushes/FreehandBrush";
import { SprayBrush } from "../brushes/SprayBrush";
import { TextureBrush } from "../brushes/TextureBrush";
import { MarkerBrush } from "../brushes/MarkerBrush";
import { HighlighterBrush } from "../brushes/HighlighterBrush";
import { AirbrushBrush } from "../brushes/AirbrushBrush";
import { CalligraphyBrush } from "../brushes/CalligraphyBrush";
import { stampBrushes } from "../brushes/stampBrushes";
import type { Brush } from "../types";

export class BrushRegistry {
  private brushes = new Map<string, Brush>();

  register(b: Brush) {
    this.brushes.set(b.key, b);
  }

  unregister(key: string) {
    this.brushes.delete(key);
  }

  get(k: string) {
    return this.brushes.get(k);
  }

  has(key: string) {
    return this.brushes.has(key);
  }

  keys() {
    return [...this.brushes.keys()];
  }

  all() {
    return [...this.brushes.values()];
  }
}

export const brushRegistry = new BrushRegistry();

export function registerDefaultBrushes() {
  brushRegistry.register(new FreehandBrush());
  brushRegistry.register(new MarkerBrush());
  brushRegistry.register(new HighlighterBrush());
  brushRegistry.register(new AirbrushBrush());
  brushRegistry.register(new CalligraphyBrush());
  for (const brush of stampBrushes) brushRegistry.register(brush);
  brushRegistry.register(new SprayBrush());
  brushRegistry.register(new TextureBrush());
}
