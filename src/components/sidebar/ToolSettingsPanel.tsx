import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const ToolSettingsPanel: React.FC = observer(
  () => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();

    const forceDrawing = () => {
      if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
    };

    if (canvasStore.currentBrushStyle === "eraser") {
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
                forceDrawing();
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
              onChange={(e) =>
                settingsStore.setEraserWholeStroke(e.target.checked)
              }
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
    }

    // Brush settings (ink, spray)
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Brush Size:{" "}
            <span className="font-semibold">{canvasStore.currentSize}px</span>
          </Label>
          <Slider
            value={[canvasStore.currentSize]}
            onValueChange={(v) => {
              forceDrawing();
              canvasStore.setPenSize(v[0]);
            }}
            min={1}
            max={50}
            step={1}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Opacity:{" "}
            {Math.round((canvasStore.brushSettings.opacity ?? 1) * 100)}%
          </Label>
          <Slider
            value={[canvasStore.brushSettings.opacity ?? 1]}
            onValueChange={(v) => {
              forceDrawing();
              canvasStore.setBrushSettings({ opacity: v[0] });
            }}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
        </div>

        {canvasStore.currentBrushStyle === "ink" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Thinning:{" "}
                {(canvasStore.brushSettings.thinning * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.thinning]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ thinning: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Smoothing:{" "}
                {(canvasStore.brushSettings.smoothing * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.smoothing]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ smoothing: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Streamline:{" "}
                {(canvasStore.brushSettings.streamline * 100).toFixed(0)}%
              </Label>
              <Slider
                value={[canvasStore.brushSettings.streamline]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ streamline: v[0] });
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Taper Start: {canvasStore.brushSettings.taperStart}
              </Label>
              <Slider
                value={[canvasStore.brushSettings.taperStart]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ taperStart: v[0] });
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                Taper End: {canvasStore.brushSettings.taperEnd}
              </Label>
              <Slider
                value={[canvasStore.brushSettings.taperEnd]}
                onValueChange={(v) => {
                  forceDrawing();
                  canvasStore.setBrushSettings({ taperEnd: v[0] });
                }}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>
    );
  },
);

export default ToolSettingsPanel;
