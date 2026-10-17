import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { BRUSH_CATEGORIES } from "@/utils/brushCategories";
import {
  applyPreset,
  getBrushState,
  isPresetModified,
  isStrokeOpen,
  lastInputWasPen,
  resetPreset,
  resetStroke,
  setStrokeOpen,
} from "@/utils/brushMemory";
import StrokeCanvas, { type StrokeLook } from "./brush-settings/StrokeCanvas";
import PresetList from "./brush-settings/PresetList";
import SettingSlider from "./brush-settings/SettingSlider";
import StrokeSection, { type StrokeValues } from "./brush-settings/StrokeSection";

const PANEL_W = 264;

const EraserSettings: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const settingsStore = useSettingsStore();
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">
          Eraser Size:{" "}
          <span className="font-semibold">{canvasStore.eraserSize}px</span>
        </Label>
        <Slider
          value={[canvasStore.eraserSize]}
          onValueChange={(v) => {
            if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
            canvasStore.setEraserSize(v[0]);
          }}
          min={1}
          max={100}
          step={1}
          className="w-full"
        />
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-gray-600 cursor-pointer">
        <span>Erase whole stroke</span>
        <input
          type="checkbox"
          checked={settingsStore.eraserWholeStroke}
          onChange={(e) => settingsStore.setEraserWholeStroke(e.target.checked)}
          className="cursor-pointer"
        />
      </label>
      <div className="text-[11px] text-gray-500 leading-snug">
        {settingsStore.eraserWholeStroke
          ? "Hover deletes whole strokes and shapes on release."
          : "Default: punches through strokes, deletes whole shapes."}
      </div>
    </div>
  );
});

const ToolSettingsPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const brushStyle = canvasStore.currentBrushStyle;

  if (brushStyle === "eraser") return <EraserSettings />;

  const brush = brushRegistry.get(brushStyle);
  const presets = brush?.presets ?? [];
  const strokeSettings = brush?.strokeSettings ?? [];
  const maxSize = brush?.maxSize ?? 100;
  const bs = canvasStore.brushSettings;
  const category = BRUSH_CATEGORIES.find((c) => c.id === brush?.category);
  const state = getBrushState(brushStyle);
  const modified = isPresetModified(canvasStore, brushStyle);

  const toBrush = () => {
    if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
  };

  const look: StrokeLook = {
    brushStyle,
    color: canvasStore.currentColor,
    size: canvasStore.currentSize,
    opacity: bs.opacity ?? 1,
    angle: bs.angle,
    softness: bs.softness,
    thinning: bs.thinning,
    smoothing: bs.smoothing,
    streamline: bs.streamline,
    taperStart: bs.taperStart,
    taperEnd: bs.taperEnd,
  };

  const strokeValues: StrokeValues = {
    thinning: bs.thinning,
    smoothing: bs.smoothing,
    streamline: bs.streamline,
    taperStart: bs.taperStart,
    taperEnd: bs.taperEnd,
  };

  return (
    <div className="space-y-4" style={{ width: PANEL_W }}>
      <div>
        <div className="flex items-baseline justify-between px-1 pb-2">
          <span className="text-sm font-semibold text-gray-900">
            {brush?.label ?? brushStyle}
          </span>
          {category && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {category.label}
            </span>
          )}
        </div>
        <div className="rounded-xl bg-[#f4f4f6] overflow-hidden">
          <StrokeCanvas look={look} width={PANEL_W} height={72} amplitude={16} maxSize={40} />
        </div>
      </div>

      {presets.length > 0 && (
        <PresetList
          presets={presets}
          activeId={state.presetId}
          modified={modified}
          base={look}
          maxSize={22}
          onApply={(id) => {
            toBrush();
            applyPreset(canvasStore, brushStyle, id);
          }}
          onReset={() => resetPreset(canvasStore, brushStyle)}
        />
      )}

      <div className="space-y-4 px-1">
        <SettingSlider
          label="Size"
          value={canvasStore.currentSize}
          display={`${canvasStore.currentSize} px`}
          min={1}
          max={maxSize}
          step={1}
          onChange={(v) => {
            toBrush();
            canvasStore.setPenSize(v);
          }}
        />
        <SettingSlider
          label="Opacity"
          value={bs.opacity ?? 1}
          display={`${Math.round((bs.opacity ?? 1) * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => {
            toBrush();
            canvasStore.setBrushSettings({ opacity: v });
          }}
        />
        {brushStyle === "calligraphy" && (
          <SettingSlider
            label="Nib angle"
            value={bs.angle}
            display={`${bs.angle}°`}
            min={0}
            max={180}
            step={1}
            onChange={(v) => {
              toBrush();
              canvasStore.setBrushSettings({ angle: v });
            }}
          />
        )}
        {brushStyle === "airbrush" && (
          <SettingSlider
            label="Softness"
            value={bs.softness}
            display={`${Math.round(bs.softness * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => {
              toBrush();
              canvasStore.setBrushSettings({ softness: v });
            }}
          />
        )}
      </div>

      {strokeSettings.length > 0 && (
        <div className="border-t border-gray-100 px-1 pt-2">
          <StrokeSection
            settings={strokeSettings}
            values={strokeValues}
            open={isStrokeOpen()}
            penInput={lastInputWasPen()}
            onToggle={() => setStrokeOpen(!isStrokeOpen())}
            onChange={(patch) => {
              toBrush();
              canvasStore.setBrushSettings(patch);
            }}
            onReset={() => resetStroke(canvasStore, brushStyle)}
          />
        </div>
      )}
    </div>
  );
});

export default ToolSettingsPanel;
