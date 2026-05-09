import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { ZColorPicker, type ZColorResult } from "@zzro/z-color-picker";
import "@zzro/z-color-picker/styles";

const commonColors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00"];

const ColorPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  const selected = canvasStore.selectedLayer;
  const editingShape =
    selected && selected.type === "shape" ? (selected as any) : null;

  const handleColorChange = (color: ZColorResult<["hex"]>) => {
    canvasStore.setColor(color.hex);
  };

  const setTarget = (t: "stroke" | "fill") => {
    canvasStore.setColorTarget(t);
    if (t === "fill" && editingShape && editingShape.fillColor === null) {
      editingShape.setFillColor(canvasStore.currentColor);
    }
  };

  return (
    <div className="space-y-3">
      {editingShape && (
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded">
          <button
            onClick={() => setTarget("stroke")}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-1 text-xs rounded transition-colors ${
              canvasStore.colorTarget === "stroke"
                ? "bg-white shadow-sm font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{ backgroundColor: editingShape.strokeColor }}
            />
            Stroke
          </button>
          <button
            onClick={() => setTarget("fill")}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-1 text-xs rounded transition-colors ${
              canvasStore.colorTarget === "fill"
                ? "bg-white shadow-sm font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span
              className="w-3 h-3 rounded-full border border-gray-300"
              style={{
                backgroundColor: editingShape.fillColor ?? "transparent",
                backgroundImage:
                  editingShape.fillColor === null
                    ? "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)"
                    : undefined,
              }}
            />
            Fill
          </button>
        </div>
      )}

      <ZColorPicker
        initialColor={{ r: 0, g: 0, b: 0, a: 1 }}
        size={200}
        formats={["hex"]}
        onChange={handleColorChange}
        showColorRings={true}
        showBrightnessBar={true}
        colorRingsPalette={commonColors}
      />
    </div>
  );
});

export default ColorPanel;
