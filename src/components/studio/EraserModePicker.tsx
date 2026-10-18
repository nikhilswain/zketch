import type React from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore } from "@/hooks/useStores";

const MODES = [
  { id: "element", label: "Whole", hint: "Anything the eraser touches is deleted whole" },
  { id: "pixel", label: "Pixels", hint: "Rubs out only the parts it touches" },
  { id: "smart", label: "Smart", hint: "Rubs out brush strokes; removes shapes, arrows and text whole" },
] as const;

const EraserModePicker: React.FC = observer(() => {
  const settingsStore = useSettingsStore();
  return (
    <div role="radiogroup" aria-label="Eraser mode" className="flex rounded-[4px] bg-zk-raised p-0.5">
      {MODES.map((m) => {
        const on = settingsStore.eraserMode === m.id;
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={on}
            title={m.hint}
            onClick={() => settingsStore.setEraserMode(m.id)}
            className={`h-7 rounded-[3px] px-2.5 text-[12px] font-semibold transition-colors ${
              on ? "bg-zk-selected text-zk-accent" : "text-zk-text-2 hover:text-zk-text"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
});

export default EraserModePicker;
