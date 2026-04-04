import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { ZColorPicker, type ZColorResult } from "@zzro/z-color-picker";
import "@zzro/z-color-picker/styles";

const commonColors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00"];

const ColorPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  const handleColorChange = (color: ZColorResult<["hex"]>) => {
    canvasStore.setColor(color.hex);
  };

  return (
    <div className="space-y-3">
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
