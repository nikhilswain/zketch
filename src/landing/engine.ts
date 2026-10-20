import type { Brush } from "@/engine/types";
import type { BrushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { FreehandBrush } from "@/engine/brushes/FreehandBrush";
import { MarkerBrush } from "@/engine/brushes/MarkerBrush";
import { stampBrushes } from "@/engine/brushes/stampBrushes";
import { rav89Brushes } from "@/engine/brushes/rav89Brushes";
import { brushAssetsPending, installBrushAssetLoader, onBrushAssetsChanged } from "@/engine/stamp/assets";
import { getGrainMask } from "@/engine/stamp/grain";
import type { Doodle } from "./doodles/library";

let registry: BrushRegistry | null = null;

export function landingRegistry(): BrushRegistry {
  if (registry) return registry;
  const brushes = new Map<string, Brush>();
  for (const b of [new FreehandBrush(), new MarkerBrush(), ...stampBrushes, ...rav89Brushes] as Brush[]) brushes.set(b.key, b);
  registry = {
    get: (k: string) => brushes.get(k),
    has: (k: string) => brushes.has(k),
    keys: () => [...brushes.keys()],
    all: () => [...brushes.values()],
    register: (b: Brush) => brushes.set(b.key, b),
    unregister: (k: string) => brushes.delete(k),
  } as unknown as BrushRegistry;
  if (typeof window !== "undefined") installBrushAssetLoader();
  return registry;
}

export { onBrushAssetsChanged };

let probe: HTMLCanvasElement | null = null;

export function whenBrushesReady(doodle: Doodle, timeoutMs = 1500): Promise<void> {
  const reg = landingRegistry();
  probe ??= document.createElement("canvas");
  probe.width = probe.height = 2;
  const ctx = probe.getContext("2d")!;
  ctx.setTransform(0.01, 0, 0, 0.01, 0, 0);
  for (const s of doodle.strokes) renderStroke(ctx, { ...s, points: s.points.slice(0, 3) }, reg);
  if (brushAssetsPending() === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      resolve();
    };
    const off = onBrushAssetsChanged(() => {
      if (brushAssetsPending() === 0) finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

let warmed = false;

export function warmGrain(): void {
  if (warmed) return;
  warmed = true;
  const run = () => getGrainMask("paper-noise", 0.85);
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 200);
}
