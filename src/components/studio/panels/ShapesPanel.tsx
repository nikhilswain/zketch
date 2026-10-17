import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import StrokeTrack from "../StrokeTrack";
import PanelFrame from "../PanelFrame";

const ShapesBody: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const selectedShapes = canvasStore.selectedShapeElements as any[];
  const editingShape = selectedShapes[0] ?? null;
  const multi = selectedShapes.length > 1;
  const shapeToolActive = canvasStore.activeTool === "shape";

  if (selectedShapes.length === 0 && !shapeToolActive) {
    return (
      <p className="px-3 pb-3 text-[12px] leading-relaxed text-zk-muted">
        Pick the Shapes tool or select a shape to edit it here.
      </p>
    );
  }

  const strokeWidth = editingShape ? editingShape.strokeWidth : canvasStore.shapeStrokeWidth;
  const opacity = editingShape ? editingShape.opacity : canvasStore.shapeOpacity;
  const cornerRadius = editingShape ? editingShape.cornerRadius : canvasStore.shapeCornerRadius;
  const fillColor: string | null = editingShape ? editingShape.fillColor : canvasStore.shapeFillColor;
  const shapeType = editingShape ? editingShape.shapeType : canvasStore.currentShapeType;

  const applyToAll = (fn: (s: any) => void) => {
    if (selectedShapes.length === 0) return false;
    selectedShapes.forEach(fn);
    return true;
  };

  const toggleFill = (on: boolean) => {
    if (on) {
      const initial = canvasStore.currentColor;
      if (!applyToAll((s) => s.setFillColor(initial))) canvasStore.setShapeFillColor(initial);
      canvasStore.setColorTarget("fill");
    } else {
      if (!applyToAll((s) => s.setFillColor(null))) canvasStore.setShapeFillColor(null);
      canvasStore.setColorTarget("stroke");
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      {editingShape && (
        <span className="text-[12px] text-zk-muted">
          Editing{" "}
          <span className="font-semibold text-zk-text">
            {multi ? `${selectedShapes.length} shapes` : editingShape.shapeType}
          </span>
        </span>
      )}
      <StrokeTrack
        compact
        kind="size"
        label="Stroke width"
        value={strokeWidth}
        display={`${strokeWidth} px`}
        min={1}
        max={50}
        step={1}
        onChange={(v) => {
          if (!applyToAll((s) => s.setStrokeWidth(v))) canvasStore.setShapeStrokeWidth(v);
        }}
      />
      <StrokeTrack
        compact
        kind="opacity"
        color={canvasStore.currentColor}
        label="Opacity"
        value={opacity}
        display={`${Math.round(opacity * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => {
          if (!applyToAll((s) => s.setOpacity(v))) canvasStore.setShapeOpacity(v);
        }}
      />
      {shapeType !== "circle" && (
        <StrokeTrack
          compact
          kind="flat"
          label="Corner radius"
          value={cornerRadius}
          display={`${Math.round(cornerRadius)} px`}
          min={0}
          max={64}
          step={1}
          onChange={(v) => {
            if (!applyToAll((s) => s.setCornerRadius(v))) canvasStore.setShapeCornerRadius(v);
          }}
        />
      )}
      <label className="flex cursor-pointer items-center justify-between text-[13px] text-zk-text-2">
        <span>Fill</span>
        <span className="flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-[3px]"
            style={{
              backgroundColor: fillColor ?? "transparent",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
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
            className="h-4 w-4 cursor-pointer accent-[var(--zk-accent)]"
          />
        </span>
      </label>
      {fillColor !== null && (
        <p className="text-[11px] leading-snug text-zk-muted">
          Switch the Colour panel to Fill to change the fill colour.
        </p>
      )}
    </div>
  );
});

const ShapesPanel: React.FC = () => (
  <PanelFrame id="shapes" title="Shapes">
    <ShapesBody />
  </PanelFrame>
);

export default ShapesPanel;
