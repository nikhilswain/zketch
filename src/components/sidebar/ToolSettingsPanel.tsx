import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface ToolSettingsPanelProps {
  isDrawingMode: boolean;
  onForceDrawingMode: () => void;
}

const ToolSettingsPanel: React.FC<ToolSettingsPanelProps> = observer(
  ({ isDrawingMode, onForceDrawingMode }) => {
    const canvasStore = useCanvasStore();

    const forceDrawing = () => {
      if (!isDrawingMode) onForceDrawingMode();
    };

    const selectedLayer = canvasStore.selectedLayer;
    const editingShape =
      selectedLayer && selectedLayer.type === "shape"
        ? (selectedLayer as any)
        : null;
    const isShapeMode = canvasStore.activeTool === "shape" || !!editingShape;

    if (isShapeMode) {
      const strokeWidth = editingShape
        ? editingShape.strokeWidth
        : canvasStore.shapeStrokeWidth;
      const opacity = editingShape
        ? editingShape.opacity
        : canvasStore.shapeOpacity;
      const cornerRadius = editingShape
        ? editingShape.cornerRadius
        : canvasStore.shapeCornerRadius;
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

      return (
        <div className="space-y-3">
          {editingShape && (
            <div className="text-xs text-gray-500">
              Editing: <span className="font-medium">{editingShape.name}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">
              Stroke Width:{" "}
              <span className="font-semibold">{strokeWidth}px</span>
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
        </div>
      );
    }

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
        </div>
      );
    }

    // Brush settings (ink, spray, texture)
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
