import { observable, reaction, runInAction } from "mobx";
import {
  brushRegistry,
  registerDefaultBrushes,
} from "@/engine/render/BrushRegistry";
import { strokeDefaultsFor } from "@/engine/render/dynamics";
import type { BrushPreset, BrushStyle } from "@/engine/types";
import type { ICanvasModel } from "@/models/CanvasModel";

const STORAGE_KEY = "zketch-brush-memory-v1";
const SAVE_DELAY_MS = 300;
const NUMERIC_FIELDS = [
  "size",
  "opacity",
  "angle",
  "softness",
  "thinning",
  "smoothing",
  "streamline",
  "taperStart",
  "taperEnd",
] as const;

export interface BrushState {
  size: number;
  opacity: number;
  angle: number;
  softness: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
  presetId: string | null;
}

const memory = observable({
  brushes: observable.map<string, BrushState>(),
  tips: observable.map<string, number[]>(),
  strokeOpen: false,
  lastInput: "mouse" as string,
  lastBrush: "ink" as string,
});

function isBrushState(value: unknown): value is BrushState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    NUMERIC_FIELDS.every((k) => typeof v[k] === "number" && Number.isFinite(v[k])) &&
    (v.presetId === null || typeof v.presetId === "string")
  );
}

const RANGES: Record<(typeof NUMERIC_FIELDS)[number], [number, number]> = {
  size: [1, 100],
  opacity: [0, 1],
  angle: [0, 180],
  softness: [0, 1],
  thinning: [0, 1],
  smoothing: [0, 1],
  streamline: [0, 1],
  taperStart: [0, 100],
  taperEnd: [0, 100],
};

function clampState(key: string, state: BrushState): BrushState {
  const out = { ...state };
  for (const k of NUMERIC_FIELDS) {
    const [min, max] =
      k === "size" ? [1, brushRegistry.get(key)?.maxSize ?? 100] : RANGES[k];
    out[k] = Math.max(min, Math.min(max, state[k]));
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    runInAction(() => {
      memory.strokeOpen = parsed?.strokeOpen === true;
      for (const [key, value] of Object.entries(parsed?.brushes ?? {})) {
        if (brushRegistry.has(key) && isBrushState(value)) {
          memory.brushes.set(key, clampState(key, value));
        }
      }
      for (const [key, value] of Object.entries(parsed?.tips ?? {})) {
        const count = brushRegistry.get(key)?.tipChoices?.length ?? 0;
        if (!Array.isArray(value)) continue;
        const set = [...new Set(value)].filter(
          (i): i is number => Number.isInteger(i) && i >= 0 && i < count,
        );
        if (set.length > 0 && set.length < count) memory.tips.set(key, set.sort((a, b) => a - b));
      }
    });
  } catch {
    return;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          strokeOpen: memory.strokeOpen,
          brushes: Object.fromEntries(memory.brushes),
          tips: Object.fromEntries(memory.tips),
        }),
      );
    } catch {
      return;
    }
  }, SAVE_DELAY_MS);
}

function firstPreset(key: string): BrushPreset | undefined {
  return brushRegistry.get(key)?.presets?.[0];
}

export function initialState(key: string): BrushState {
  const preset = firstPreset(key);
  const stroke = strokeDefaultsFor(brushRegistry.get(key));
  return {
    size: preset?.size ?? 4,
    opacity: preset?.opacity ?? 1,
    angle: preset?.angle ?? 45,
    softness: preset?.softness ?? 0.5,
    ...stroke,
    presetId: preset?.id ?? null,
  };
}

function capture(store: ICanvasModel, presetId: string | null): BrushState {
  const bs = store.brushSettings;
  return {
    size: store.currentSize,
    opacity: bs.opacity ?? 1,
    angle: bs.angle,
    softness: bs.softness,
    thinning: bs.thinning,
    smoothing: bs.smoothing,
    streamline: bs.streamline,
    taperStart: bs.taperStart,
    taperEnd: bs.taperEnd,
    presetId,
  };
}

function apply(store: ICanvasModel, state: BrushState) {
  store.setPenSize(state.size);
  store.setBrushSettings({
    opacity: state.opacity,
    angle: state.angle,
    softness: state.softness,
    thinning: state.thinning,
    smoothing: state.smoothing,
    streamline: state.streamline,
    taperStart: state.taperStart,
    taperEnd: state.taperEnd,
  });
}

function remembers(key: string) {
  return key !== "eraser" && brushRegistry.has(key);
}

export function getBrushState(key: string): BrushState {
  return memory.brushes.get(key) ?? initialState(key);
}

export function getPreset(key: string): BrushPreset | undefined {
  const id = getBrushState(key).presetId;
  return brushRegistry.get(key)?.presets?.find((p) => p.id === id);
}

export function isPresetModified(store: ICanvasModel, key: string) {
  const preset = getPreset(key);
  if (!preset) return false;
  const bs = store.brushSettings;
  return (
    (preset.size !== undefined && preset.size !== store.currentSize) ||
    (preset.opacity !== undefined && preset.opacity !== (bs.opacity ?? 1)) ||
    (preset.angle !== undefined && preset.angle !== bs.angle) ||
    (preset.softness !== undefined && preset.softness !== bs.softness)
  );
}

export function applyPreset(store: ICanvasModel, key: string, presetId: string) {
  const preset = brushRegistry.get(key)?.presets?.find((p) => p.id === presetId);
  if (!preset) return;
  runInAction(() => {
    memory.brushes.set(key, { ...capture(store, presetId) });
  });
  if (preset.size !== undefined) store.setPenSize(preset.size);
  const patch: { opacity?: number; angle?: number; softness?: number } = {};
  if (preset.opacity !== undefined) patch.opacity = preset.opacity;
  if (preset.angle !== undefined) patch.angle = preset.angle;
  if (preset.softness !== undefined) patch.softness = preset.softness;
  store.setBrushSettings(patch);
}

export function resetPreset(store: ICanvasModel, key: string) {
  const id = getBrushState(key).presetId;
  if (id) applyPreset(store, key, id);
}

export function resetStroke(store: ICanvasModel, key: string) {
  const d = strokeDefaultsFor(brushRegistry.get(key));
  store.setBrushSettings({
    thinning: d.thinning,
    smoothing: d.smoothing,
    streamline: d.streamline,
    taperStart: d.taperStart,
    taperEnd: d.taperEnd,
  });
}

export function getTipSet(key: string): number[] | null {
  const set = memory.tips.get(key);
  return set ? [...set] : null;
}

export function toggleTip(key: string, index: number) {
  const count = brushRegistry.get(key)?.tipChoices?.length ?? 0;
  if (index < 0 || index >= count) return;
  const current = memory.tips.get(key) ?? Array.from({ length: count }, (_, i) => i);
  const next = current.includes(index)
    ? current.filter((i) => i !== index)
    : [...current, index].sort((a, b) => a - b);
  if (next.length === 0) return;
  runInAction(() => {
    if (next.length === count) memory.tips.delete(key);
    else memory.tips.set(key, next);
  });
  scheduleSave();
}

export function isStrokeOpen() {
  return memory.strokeOpen;
}

export function setStrokeOpen(open: boolean) {
  runInAction(() => {
    memory.strokeOpen = open;
  });
  scheduleSave();
}

export function lastBrush(): BrushStyle {
  return memory.lastBrush as BrushStyle;
}

export function lastInputWasPen() {
  return memory.lastInput === "pen";
}

export function selectBrush(store: ICanvasModel, key: BrushStyle) {
  store.setBrushStyle(key);
  store.setActiveTool("brush");
}

export function installBrushMemory(store: ICanvasModel): () => void {
  if (brushRegistry.keys().length === 0) registerDefaultBrushes();
  load();
  const onPointerDown = (e: PointerEvent) => {
    if (!(e.target instanceof Element) || !e.target.closest("[data-canvas-root]")) return;
    if (e.pointerType !== memory.lastInput) {
      runInAction(() => {
        memory.lastInput = e.pointerType;
      });
    }
  };
  window.addEventListener("pointerdown", onPointerDown, true);
  const current = store.currentBrushStyle;
  if (remembers(current)) {
    apply(store, getBrushState(current));
    runInAction(() => {
      memory.lastBrush = current;
    });
  }

  const stopSwitch = reaction(
    () => store.currentBrushStyle,
    (next, prev) => {
      if (remembers(prev)) {
        runInAction(() => {
          memory.brushes.set(prev, capture(store, getBrushState(prev).presetId));
        });
        scheduleSave();
      }
      if (remembers(next)) {
        apply(store, getBrushState(next));
        runInAction(() => {
          memory.lastBrush = next;
        });
      }
    },
  );

  const stopTrack = reaction(
    () => {
      const bs = store.brushSettings;
      return [
        store.currentSize,
        bs.opacity,
        bs.angle,
        bs.softness,
        bs.thinning,
        bs.smoothing,
        bs.streamline,
        bs.taperStart,
        bs.taperEnd,
      ];
    },
    () => {
      const key = store.currentBrushStyle;
      if (!remembers(key)) return;
      runInAction(() => {
        memory.brushes.set(key, capture(store, getBrushState(key).presetId));
      });
      scheduleSave();
    },
  );

  return () => {
    window.removeEventListener("pointerdown", onPointerDown, true);
    stopSwitch();
    stopTrack();
  };
}
