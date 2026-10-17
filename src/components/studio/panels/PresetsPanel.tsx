import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { BRUSH_CATEGORIES } from "@/utils/brushCategories";
import {
  applyPreset,
  getBrushState,
  isPresetModified,
  resetPreset,
} from "@/utils/brushMemory";
import PanelFrame, { usePanelVariant } from "../PanelFrame";
import StrokeCanvas from "./StrokeCanvas";
import PresetList from "./PresetList";
import { currentBrushLook } from "./brushLook";

export const PresetsBody: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const variant = usePanelVariant();
  const key = canvasStore.currentBrushStyle;

  if (key === "eraser") {
    return (
      <p className="px-3 pb-3 text-[12px] leading-relaxed text-zk-muted">
        The eraser&apos;s size and mode are in the bottom bar.
      </p>
    );
  }

  const brush = brushRegistry.get(key);
  const presets = brush?.presets ?? [];
  const category = BRUSH_CATEGORIES.find((c) => c.id === brush?.category);
  const look = currentBrushLook(canvasStore);
  const width = variant === "deck" ? 220 : 276;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
      <div className="flex items-baseline justify-between px-0.5">
        <span className="font-display text-[22px] font-semibold leading-tight text-zk-text">
          {brush?.label ?? key}
        </span>
        {category && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zk-muted">
            {category.label}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-[4px] bg-zk-raised">
        <StrokeCanvas
          look={{ ...look, color: "#ECEBE7" }}
          width={width}
          height={variant === "deck" ? 48 : 60}
          amplitude={variant === "deck" ? 10 : 13}
          maxSize={36}
        />
      </div>
      {presets.length > 0 && (
        <PresetList
          presets={presets}
          activeId={getBrushState(key).presetId}
          modified={isPresetModified(canvasStore, key)}
          base={look}
          maxSize={20}
          onApply={(id) => {
            if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
            applyPreset(canvasStore, key, id);
          }}
        />
      )}
    </div>
  );
});

const ResetPresetAction: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const key = canvasStore.currentBrushStyle;
  if (key === "eraser" || !isPresetModified(canvasStore, key)) return null;
  return (
    <button
      onClick={() => resetPreset(canvasStore, key)}
      className="text-[11px] text-zk-muted hover:text-zk-text"
    >
      Reset
    </button>
  );
});

const PresetsPanel: React.FC = () => (
  <PanelFrame id="presets" title="Presets" actions={<ResetPresetAction />}>
    <PresetsBody />
  </PanelFrame>
);

export default PresetsPanel;
