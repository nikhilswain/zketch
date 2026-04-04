import type React from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore } from "@/hooks/useStores";

const touchModeOptions: {
  value: "auto" | "stylus-only" | "touch-draw";
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "stylus-only", label: "Stylus Only" },
  { value: "touch-draw", label: "Touch Draw" },
];

const TouchModePanel: React.FC = observer(() => {
  const settingsStore = useSettingsStore();

  return (
    <div className="grid grid-cols-3 gap-2">
      {touchModeOptions.map((tm) => (
        <button
          key={tm.value}
          onClick={() => settingsStore.setTouchMode(tm.value)}
          className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all text-xs ${
            settingsStore.touchMode === tm.value
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {tm.label}
        </button>
      ))}
    </div>
  );
});

export default TouchModePanel;
