import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import PanelFrame, { usePanelVariant } from "../PanelFrame";
import HsvPicker from "../HsvPicker";

export const SWATCHES = [
  { name: "Ink", hex: "#1F1F24" },
  { name: "Chalk", hex: "#F3F1EA" },
  { name: "Coral", hex: "#E5644D" },
  { name: "Ochre", hex: "#D99A3A" },
  { name: "Moss", hex: "#6F8F5A" },
  { name: "Pine", hex: "#3F5A4B" },
  { name: "Sky", hex: "#8FB1D9" },
  { name: "Plum", hex: "#6B4A6E" },
  { name: "Rust", hex: "#9A4A2C" },
  { name: "Slate", hex: "#4A5568" },
  { name: "Lime", hex: "#C6F432" },
  { name: "White", hex: "#FFFFFF" },
];

const ColourBody: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const variant = usePanelVariant();
  const shapes = canvasStore.selectedShapeElements as any[];
  const previewShape = shapes[0] ?? null;
  const colour = canvasStore.currentColor;

  const setTarget = (t: "stroke" | "fill") => {
    canvasStore.setColorTarget(t);
    if (t === "fill" && shapes.length > 0) {
      shapes.forEach((s) => {
        if (s.fillColor === null) s.setFillColor(canvasStore.currentColor);
      });
    }
  };

  const target = previewShape && (
    <div className="flex gap-1 rounded-[4px] bg-zk-raised p-0.5">
      {(["stroke", "fill"] as const).map((t) => {
        const swatch = t === "stroke" ? previewShape.strokeColor : previewShape.fillColor;
        const active = canvasStore.colorTarget === t;
        return (
          <button
            key={t}
            onClick={() => setTarget(t)}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[3px] py-1 text-[12px] ${
              active ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
            }`}
          >
            <span
              className="h-3 w-3 rounded-[2px]"
              style={{
                backgroundColor: swatch ?? "transparent",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
                backgroundImage:
                  swatch === null
                    ? "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)"
                    : undefined,
              }}
            />
            {t === "stroke" ? "Stroke" : "Fill"}
          </button>
        );
      })}
    </div>
  );

  const swatches = (
    <div className={`grid gap-1 ${variant === "deck" ? "grid-cols-4" : "grid-cols-6"}`}>
      {SWATCHES.map((s) => (
        <button
          key={s.hex}
          aria-label={s.name}
          aria-pressed={colour.toUpperCase() === s.hex}
          onClick={() => canvasStore.setColor(s.hex)}
          className="aspect-square rounded-[3px]"
          style={{
            backgroundColor: s.hex,
            boxShadow:
              colour.toUpperCase() === s.hex
                ? "0 0 0 2px var(--zk-surface), 0 0 0 3px #ECEBE7"
                : "inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  );

  if (variant === "deck") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {target}
        <div className="flex gap-3">
          <HsvPicker value={colour} onChange={(hex) => canvasStore.setColor(hex)} size={128} />
          <div className="flex-1">{swatches}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3">
      {target}
      <HsvPicker value={colour} onChange={(hex) => canvasStore.setColor(hex)} size={270} />
      {swatches}
    </div>
  );
});

const ColourPanel: React.FC = () => (
  <PanelFrame id="colour" title="Colour">
    <ColourBody />
  </PanelFrame>
);

export default ColourPanel;
