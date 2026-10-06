import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { createGetBrushOptions } from "@/engine/brushOptions";
import type { StrokeLike } from "@/engine";

const PREVIEW_W = 236;
const PREVIEW_H = 64;

const BrushPreview: React.FC<{ brushStyle: string }> = observer(
  ({ brushStyle }) => {
    const canvasStore = useCanvasStore();
    const ref = useRef<HTMLCanvasElement>(null);
    const bs = canvasStore.brushSettings;

    useEffect(() => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = PREVIEW_W * dpr;
      canvas.height = PREVIEW_H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

      const size = canvasStore.currentSize;
      const points: Array<{ x: number; y: number; pressure: number }> = [];
      for (let i = 0; i <= 44; i++) {
        const t = i / 44;
        points.push({
          x: 16 + t * (PREVIEW_W - 32),
          y: PREVIEW_H / 2 + Math.sin(t * Math.PI * 2) * 13,
          pressure: 0.3 + 0.7 * Math.sin(t * Math.PI),
        });
      }
      const stroke: StrokeLike = {
        id: "preview",
        points,
        color: canvasStore.currentColor,
        size,
        opacity: bs.opacity ?? 1,
        brushStyle: brushStyle as StrokeLike["brushStyle"],
        timestamp: 0,
        thinning: bs.thinning,
        smoothing: bs.smoothing,
        streamline: bs.streamline,
        taperStart: bs.taperStart,
        taperEnd: bs.taperEnd,
        easing: bs.easing,
        angle: bs.angle,
        softness: bs.softness,
      };

      const scale = Math.min(1, 34 / Math.max(1, size));
      ctx.save();
      ctx.translate(PREVIEW_W / 2, PREVIEW_H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-PREVIEW_W / 2, -PREVIEW_H / 2);
      renderStroke(ctx, stroke, brushRegistry, createGetBrushOptions(bs as never));
      ctx.restore();
    }, [
      brushStyle,
      canvasStore.currentColor,
      canvasStore.currentSize,
      bs.opacity,
      bs.angle,
      bs.softness,
      bs.thinning,
      bs.smoothing,
      bs.streamline,
      bs.taperStart,
      bs.taperEnd,
    ]);

    return (
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <canvas
          ref={ref}
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
          className="w-full block"
        />
      </div>
    );
  },
);

const ToolSettingsPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const settingsStore = useSettingsStore();
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const brushStyle = canvasStore.currentBrushStyle;

  useEffect(() => {
    setActivePreset(null);
  }, [brushStyle]);

  const forceDrawing = () => {
    if (canvasStore.activeTool !== "brush") canvasStore.setActiveTool("brush");
  };

  if (brushStyle === "eraser") {
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

  const brush = brushRegistry.get(brushStyle);
  const presets = brush?.presets ?? [];
  const bs = canvasStore.brushSettings;

  const applyPreset = (preset: {
    id: string;
    size?: number;
    opacity?: number;
    angle?: number;
    softness?: number;
  }) => {
    forceDrawing();
    if (preset.size !== undefined) canvasStore.setPenSize(preset.size);
    const patch: { opacity?: number; angle?: number; softness?: number } = {};
    if (preset.opacity !== undefined) patch.opacity = preset.opacity;
    if (preset.angle !== undefined) patch.angle = preset.angle;
    if (preset.softness !== undefined) patch.softness = preset.softness;
    if (Object.keys(patch).length > 0) canvasStore.setBrushSettings(patch);
    setActivePreset(preset.id);
  };

  const setSize = (v: number) => {
    forceDrawing();
    setActivePreset(null);
    canvasStore.setPenSize(v);
  };
  const setOpacity = (v: number) => {
    forceDrawing();
    setActivePreset(null);
    canvasStore.setBrushSettings({ opacity: v });
  };

  return (
    <div className="space-y-3">
      <BrushPreview brushStyle={brushStyle} />

      <div className="text-xs font-semibold text-gray-800">
        {brush?.label ?? brushStyle}
      </div>

      {presets.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-600">Variants</Label>
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                  activePreset === preset.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">
          Brush Size: <span className="font-semibold">{canvasStore.currentSize}px</span>
        </Label>
        <Slider
          value={[canvasStore.currentSize]}
          onValueChange={(v) => setSize(v[0])}
          min={1}
          max={100}
          step={1}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">
          Opacity: {Math.round((bs.opacity ?? 1) * 100)}%
        </Label>
        <Slider
          value={[bs.opacity ?? 1]}
          onValueChange={(v) => setOpacity(v[0])}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
      </div>

      {brushStyle === "calligraphy" && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Nib Angle: <span className="font-semibold">{bs.angle}°</span>
          </Label>
          <Slider
            value={[bs.angle]}
            onValueChange={(v) => {
              forceDrawing();
              setActivePreset(null);
              canvasStore.setBrushSettings({ angle: v[0] });
            }}
            min={0}
            max={180}
            step={1}
            className="w-full"
          />
        </div>
      )}

      {brushStyle === "airbrush" && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Softness: {Math.round(bs.softness * 100)}%
          </Label>
          <Slider
            value={[bs.softness]}
            onValueChange={(v) => {
              forceDrawing();
              setActivePreset(null);
              canvasStore.setBrushSettings({ softness: v[0] });
            }}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
        </div>
      )}

      {brushStyle === "ink" && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">
              Thinning: {(bs.thinning * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[bs.thinning]}
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
              Smoothing: {(bs.smoothing * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[bs.smoothing]}
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
              Streamline: {(bs.streamline * 100).toFixed(0)}%
            </Label>
            <Slider
              value={[bs.streamline]}
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
              Taper Start: {bs.taperStart}
            </Label>
            <Slider
              value={[bs.taperStart]}
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
              Taper End: {bs.taperEnd}
            </Label>
            <Slider
              value={[bs.taperEnd]}
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
});

export default ToolSettingsPanel;
