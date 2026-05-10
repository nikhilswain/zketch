import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const ShapeSettingsPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  const editingShape = canvasStore.selectedShapeElement as any;
  const shapeToolActive = canvasStore.activeTool === "shape";

  if (!editingShape && !shapeToolActive) {
    return (
      <div className="text-xs text-gray-500 leading-relaxed">
        Select the Shapes tool in the dock or pick a shape layer to edit its
        settings.
      </div>
    );
  }

  const strokeWidth = editingShape
    ? editingShape.strokeWidth
    : canvasStore.shapeStrokeWidth;
  const opacity = editingShape ? editingShape.opacity : canvasStore.shapeOpacity;
  const cornerRadius = editingShape
    ? editingShape.cornerRadius
    : canvasStore.shapeCornerRadius;
  const fillColor: string | null = editingShape
    ? editingShape.fillColor
    : canvasStore.shapeFillColor;
  const shapeType = editingShape
    ? editingShape.shapeType
    : canvasStore.currentShapeType;
  const supportsCornerRadius = shapeType !== "circle";

  const setStrokeWidth = (v: number) => {
    if (editingShape) editingShape.setStrokeWidth(v);
    else canvasStore.setShapeStrokeWidth(v);
  };
  const setOpacity = (v: number) => {
    if (editingShape) editingShape.setOpacity(v);
    else canvasStore.setShapeOpacity(v);
  };
  const setCornerRadius = (v: number) => {
    if (editingShape) editingShape.setCornerRadius(v);
    else canvasStore.setShapeCornerRadius(v);
  };
  const toggleFill = (on: boolean) => {
    if (on) {
      const initial = canvasStore.currentColor;
      if (editingShape) editingShape.setFillColor(initial);
      else canvasStore.setShapeFillColor(initial);
      canvasStore.setColorTarget("fill");
    } else {
      if (editingShape) editingShape.setFillColor(null);
      else canvasStore.setShapeFillColor(null);
      canvasStore.setColorTarget("stroke");
    }
  };

  return (
    <div className="space-y-3">
      {editingShape && (
        <div className="text-xs text-gray-500">
          Editing: <span className="font-medium">{editingShape.shapeType}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">
          Stroke Width: <span className="font-semibold">{strokeWidth}px</span>
        </Label>
        <Slider
          value={[strokeWidth]}
          onValueChange={(v) => setStrokeWidth(v[0])}
          min={1}
          max={50}
          step={1}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-600">
          Opacity: {Math.round(opacity * 100)}%
        </Label>
        <Slider
          value={[opacity]}
          onValueChange={(v) => setOpacity(v[0])}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
      </div>

      {supportsCornerRadius && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-600">
            Corner Radius: {Math.round(cornerRadius)}
          </Label>
          <Slider
            value={[cornerRadius]}
            onValueChange={(v) => setCornerRadius(v[0])}
            min={0}
            max={64}
            step={1}
            className="w-full"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <Label className="text-xs font-medium text-gray-600">Fill</Label>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <span
            className="w-4 h-4 rounded border border-gray-300"
            style={{
              backgroundColor: fillColor ?? "transparent",
              backgroundImage:
                fillColor === null
                  ? "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)"
                  : undefined,
            }}
          />
          <input
            type="checkbox"
            checked={fillColor !== null}
            onChange={(e) => toggleFill(e.target.checked)}
            className="cursor-pointer"
          />
          <span>{fillColor !== null ? "On" : "Off"}</span>
        </label>
      </div>

      {fillColor !== null && (
        <div className="text-[11px] text-gray-500 leading-snug">
          Use the Color panel and switch to <span className="font-medium">Fill</span> to change the fill color.
        </div>
      )}
    </div>
  );
});

export default ShapeSettingsPanel;
