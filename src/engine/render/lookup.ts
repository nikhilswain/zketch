import type { ElementLike } from "../types";

export type ElementLookup = Map<string, ElementLike>;

export function buildElementLookup(
  layers: readonly { type: string; elements?: readonly ElementLike[] }[],
): ElementLookup {
  const map: ElementLookup = new Map();
  for (const layer of layers) {
    if (layer.type !== "draw" || !layer.elements) continue;
    for (const el of layer.elements) map.set(el.id, el);
  }
  return map;
}
