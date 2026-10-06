import { FreehandBrush } from "../brushes/FreehandBrush";
import { SprayBrush } from "../brushes/SprayBrush";
import { TextureBrush } from "../brushes/TextureBrush";
import type { Brush } from "../types";

export class BrushRegistry {
  private brushes = new Map<string, Brush>();

  register(b: Brush) {
    this.brushes.set(b.key, b);
  }

  get(k: string) {
    return this.brushes.get(k);
  }
}

export const brushRegistry = new BrushRegistry();

export function registerDefaultBrushes() {
  brushRegistry.register(new FreehandBrush());
  brushRegistry.register(new SprayBrush());
  brushRegistry.register(new TextureBrush());
}
