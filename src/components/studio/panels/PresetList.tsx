import type React from "react";
import { observer } from "mobx-react-lite";
import { themeInk } from "@/utils/theme";
import type { BrushPreset } from "@/engine/types";
import StrokeCanvas, { type StrokeLook } from "./StrokeCanvas";

interface PresetListProps {
  presets: BrushPreset[];
  activeId: string | null;
  modified: boolean;
  base: StrokeLook;
  maxSize: number;
  onApply: (id: string) => void;
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

const PresetList: React.FC<PresetListProps> = observer(({
  presets,
  activeId,
  modified,
  base,
  maxSize,
  onApply,
}) => (
  <div className="flex flex-col gap-0.5">
    {presets.map((preset) => {
      const active = preset.id === activeId;
      return (
        <button
          key={preset.id}
          onClick={() => onApply(preset.id)}
          aria-pressed={active}
          className={`flex w-full items-center gap-2 rounded-[4px] px-1.5 py-0.5 text-left transition-colors ${
            active ? "bg-zk-selected" : "hover:bg-zk-raised"
          }`}
        >
          <StrokeCanvas
            look={{
              ...base,
              color: themeInk(),
              size: preset.size ?? base.size,
              opacity: preset.opacity ?? base.opacity,
              angle: preset.angle ?? base.angle,
              softness: preset.softness ?? base.softness,
            }}
            width={72}
            height={28}
            amplitude={6}
            maxSize={maxSize}
            className="shrink-0"
          />
          <span
            className={`flex-1 truncate text-[12px] ${
              active ? "font-semibold text-zk-text" : "text-zk-text-2"
            }`}
          >
            {preset.label}
            {active && modified && <span className="font-normal text-zk-muted"> · edited</span>}
          </span>
          <span className="text-[10px] tabular-nums text-zk-muted">{describe(preset)}</span>
        </button>
      );
    })}
  </div>
));

export default PresetList;
