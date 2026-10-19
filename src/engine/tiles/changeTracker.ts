import type { ElementLike } from "../types";
import { changedIds } from "./layerDiff";

export interface TrackedLayer {
  id: string;
  elements: readonly ElementLike[];
}

export class ChangeTracker {
  private prev = new Map<string, readonly ElementLike[]>();
  private missed = new Map<string, Set<string>>();

  next(layers: readonly TrackedLayer[]): Map<string, Set<string>> {
    const global = new Set<string>();
    const present = new Set<string>();
    for (const layer of layers) {
      present.add(layer.id);
      const before = this.prev.get(layer.id);
      if (!before) {
        for (const el of layer.elements) global.add(el.id);
      } else if (before !== layer.elements) {
        for (const id of changedIds(before, layer.elements)) global.add(id);
      }
    }
    for (const [id, els] of this.prev) {
      if (present.has(id)) continue;
      for (const el of els) global.add(el.id);
      this.prev.delete(id);
      this.missed.set(id, new Set());
    }
    for (const [id, ids] of this.missed) {
      if (present.has(id)) continue;
      for (const changed of global) ids.add(changed);
    }
    const out = new Map<string, Set<string>>();
    for (const layer of layers) {
      const missed = this.missed.get(layer.id);
      this.missed.delete(layer.id);
      out.set(layer.id, missed ? new Set([...global, ...missed]) : global);
      this.prev.set(layer.id, layer.elements);
    }
    return out;
  }

  forget(id: string): void {
    this.prev.delete(id);
    this.missed.delete(id);
  }
}
