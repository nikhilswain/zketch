import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import ElementProperties, { Segmented, Swatches } from "./ElementProperties";
import EraserModePicker from "./EraserModePicker";
import StrokeTrack from "./StrokeTrack";

const PEN_SIZES = [
  { id: 4, label: "S" },
  { id: 8, label: "M" },
  { id: 16, label: "L" },
];

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zk-muted">{children}</span>
);

const PropertiesCard: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const tool = canvasStore.activeTool;
  const erasing = tool === "brush" && canvasStore.currentBrushStyle === "eraser";
  const pen = tool === "brush" && !erasing;
  const visible =
    canvasStore.hasSelection || tool === "shape" || tool === "arrow" || tool === "text" || pen || erasing;
  if (!visible) return null;

  return (
    <div
      aria-label="Properties"
      className="pointer-events-auto max-h-[calc(100vh-140px)] w-[236px] overflow-y-auto rounded-[6px] bg-zk-surface shadow-(--zk-shadow-float) p-3 text-zk-text"
    >
      {pen && !canvasStore.hasSelection ? (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label>Stroke</Label>
            <Swatches label="Pen colour" value={canvasStore.currentColor} onPick={(hex) => hex && canvasStore.setColor(hex)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Size</Label>
            <Segmented
              label="Pen size"
              options={PEN_SIZES}
              value={PEN_SIZES.some((s) => s.id === canvasStore.currentSize) ? canvasStore.currentSize : null}
              onPick={(v) => canvasStore.setPenSize(v)}
            />
          </div>
        </div>
      ) : erasing && !canvasStore.hasSelection ? (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label>Eraser</Label>
            <EraserModePicker />
          </div>
          <StrokeTrack
            compact
            kind="size"
            label="Size"
            value={canvasStore.eraserSize}
            display={`${canvasStore.eraserSize} px`}
            min={1}
            max={100}
            step={1}
            onChange={(v) => canvasStore.setEraserSize(v)}
          />
        </div>
      ) : (
        <ElementProperties variant="card" />
      )}
    </div>
  );
});

export default PropertiesCard;
