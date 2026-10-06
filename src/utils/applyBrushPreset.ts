import { brushRegistry } from "@/engine/render/BrushRegistry";
import type { BrushStyle } from "@/engine/types";

interface BrushStoreLike {
  setBrushStyle: (style: BrushStyle) => void;
  setActiveTool: (tool: "brush") => void;
  setPenSize: (size: number) => void;
  setBrushSettings: (settings: {
    opacity?: number;
    angle?: number;
    softness?: number;
  }) => void;
}

export function applyBrushPreset(store: BrushStoreLike, style: BrushStyle) {
  store.setBrushStyle(style);
  store.setActiveTool("brush");
  const preset = brushRegistry.get(style)?.presets?.[0];
  if (!preset) return;
  if (preset.size !== undefined) store.setPenSize(preset.size);
  const patch: { opacity?: number; angle?: number; softness?: number } = {};
  if (preset.opacity !== undefined) patch.opacity = preset.opacity;
  if (preset.angle !== undefined) patch.angle = preset.angle;
  if (preset.softness !== undefined) patch.softness = preset.softness;
  if (Object.keys(patch).length > 0) store.setBrushSettings(patch);
}
