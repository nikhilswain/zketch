import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import type { BackgroundType } from "@/models/CanvasModel";

const backgroundOptions: { value: BackgroundType; label: string }[] = [
  { value: "white", label: "White" },
  { value: "transparent", label: "Transparent" },
  { value: "grid", label: "Grid" },
];

const BackgroundPanel: React.FC = observer(() => {
  const canvasStore = useCanvasStore();

  return (
    <div className="grid grid-cols-3 gap-2">
      {backgroundOptions.map((bg) => (
        <button
          key={bg.value}
          onClick={() => canvasStore.setBackground(bg.value)}
          className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all text-xs ${
            canvasStore.background === bg.value
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {bg.label}
        </button>
      ))}
    </div>
  );
});

export default BackgroundPanel;
