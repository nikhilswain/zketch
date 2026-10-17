import type React from "react";
import type { BrushPreset } from "@/engine/types";
import StrokeCanvas, { type StrokeLook } from "./StrokeCanvas";

interface PresetListProps {
  presets: BrushPreset[];
  activeId: string | null;
  modified: boolean;
  base: StrokeLook;
  maxSize: number;
  onApply: (id: string) => void;
  onReset: () => void;
}

function describe(preset: BrushPreset) {
  const parts: string[] = [];
  if (preset.size !== undefined) parts.push(`${preset.size} px`);
  if (preset.opacity !== undefined && preset.opacity < 1) {
    parts.push(`${Math.round(preset.opacity * 100)}%`);
  }
  if (preset.angle !== undefined) parts.push(`${preset.angle}°`);
  return parts.join(" · ");
}

const PresetList: React.FC<PresetListProps> = ({
  presets,
  activeId,
  modified,
  base,
  maxSize,
  onApply,
  onReset,
}) => (
  <div>
    <div className="flex items-center justify-between px-1 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Presets
      </span>
      {modified && (
        <button
          onClick={onReset}
          className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
        >
          Reset
        </button>
      )}
    </div>
    <div className="space-y-0.5">
      {presets.map((preset) => {
        const active = preset.id === activeId;
        return (
          <button
            key={preset.id}
            onClick={() => onApply(preset.id)}
            className={`w-full flex items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors ${
              active ? "bg-[#ececf0]" : "hover:bg-gray-50"
            }`}
          >
            <StrokeCanvas
              look={{
                ...base,
                size: preset.size ?? base.size,
                opacity: preset.opacity ?? base.opacity,
                angle: preset.angle ?? base.angle,
                softness: preset.softness ?? base.softness,
              }}
              width={96}
              height={30}
              amplitude={7}
              maxSize={maxSize}
              className="shrink-0"
            />
            <span
              className={`flex-1 truncate text-xs ${
                active ? "font-semibold text-gray-900" : "text-gray-700"
              }`}
            >
              {preset.label}
              {active && modified && (
                <span className="font-normal text-gray-400"> · edited</span>
              )}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {describe(preset)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default PresetList;
