import type { ArrowElementLike, ElementLike, TextElementLike } from "../types";
import { elementKind } from "../types";
import type { ElementLookup } from "../render/lookup";
import { labelsByContainer } from "../geometry/labels";
import { renderBounds } from "./renderBounds";
import type { Bounds } from "./tileMath";

export interface LayerDiff {
  regions: Bounds[];
  appended: ElementLike | null;
  bounds: Map<string, Bounds | null>;
}

export function changedIds(prev: readonly ElementLike[], next: readonly ElementLike[]): Set<string> {
  const out = new Set<string>();
  const before = new Map<string, ElementLike>();
  for (const el of prev) before.set(el.id, el);
  for (const el of next) {
    if (before.get(el.id) !== el) out.add(el.id);
    before.delete(el.id);
  }
  for (const id of before.keys()) out.add(id);
  return out;
}

function dependsOnChange(
  el: ElementLike,
  labels: Map<string, TextElementLike>,
  globalChanged: Set<string>,
): boolean {
  const kind = elementKind(el);
  if (kind === "arrow") {
    const a = el as ArrowElementLike;
    if (a.startBinding && globalChanged.has(a.startBinding.elementId)) return true;
    if (a.endBinding && globalChanged.has(a.endBinding.elementId)) return true;
  }
  if (kind === "text") {
    const t = el as TextElementLike;
    if (t.containerId && globalChanged.has(t.containerId)) return true;
  }
  const label = labels.get(el.id);
  return !!label && globalChanged.has(label.id);
}

export function diffLayer(
  prev: readonly ElementLike[],
  prevBounds: Map<string, Bounds | null>,
  next: readonly ElementLike[],
  lookup: ElementLookup,
  globalChanged: Set<string>,
): LayerDiff {
  const before = new Map<string, ElementLike>();
  for (const el of prev) before.set(el.id, el);
  const labels = labelsByContainer(next);
  const bounds = new Map<string, Bounds | null>();
  const regions: Bounds[] = [];
  let changes = 0;
  for (const el of next) {
    const old = before.get(el.id);
    before.delete(el.id);
    const changed = old !== el || dependsOnChange(el, labels, globalChanged);
    if (!changed && prevBounds.has(el.id)) {
      bounds.set(el.id, prevBounds.get(el.id)!);
      continue;
    }
    const b = renderBounds(el, lookup, labels.get(el.id));
    bounds.set(el.id, b);
    changes++;
    const was = prevBounds.get(el.id);
    if (old && was) regions.push(was);
    if (b) regions.push(b);
  }
  for (const id of before.keys()) {
    const was = prevBounds.get(id);
    changes++;
    if (was) regions.push(was);
  }
  let appended: ElementLike | null = null;
  if (changes === 1 && next.length === prev.length + 1) {
    let same = true;
    for (let i = 0; i < prev.length && same; i++) same = prev[i] === next[i];
    if (same) appended = next[next.length - 1];
  }
  return { regions, appended, bounds };
}

export function regionsForIds(ids: Iterable<string>, bounds: Map<string, Bounds | null>): Bounds[] {
  const out: Bounds[] = [];
  for (const id of ids) {
    const b = bounds.get(id);
    if (b) out.push(b);
  }
  return out;
}
