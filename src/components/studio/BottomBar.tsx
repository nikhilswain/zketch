import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Maximize2,
  MousePointer2,
  Pencil,
  Shapes,
  Square,
  Triangle,
} from "lucide-react";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { lastBrush, selectBrush } from "@/utils/brushMemory";
import {
  dockLayout,
  panelsIn,
  revealPanel,
  setDeckOpen,
} from "@/utils/dockLayout";
import type { ShapeKind } from "@/models/ShapeLayerModel";
import StrokeTrack from "./StrokeTrack";
import { PanelVariantContext } from "./PanelFrame";
import { BrushLibrary } from "./panels/BrushesPanel";
import { PresetsBody } from "./panels/PresetsPanel";
import { SWATCHES } from "./panels/ColourPanel";

const SHAPES: { kind: ShapeKind; label: string; Icon: typeof Square }[] = [
  { kind: "rectangle", label: "Rectangle", Icon: Square },
  { kind: "circle", label: "Circle", Icon: Circle },
  { kind: "diamond", label: "Diamond", Icon: Diamond },
  { kind: "triangle", label: "Triangle", Icon: Triangle },
];

const Divider = () => <span className="h-7 w-px shrink-0 bg-zk-divider" />;

const ToolButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, onClick, children }) => (
  <button
    aria-label={label}
    title={label}
    aria-pressed={active}
    onClick={onClick}
    className={`flex h-10 w-10 items-center justify-center rounded-[4px] transition-colors ${
      active ? "bg-zk-hover text-zk-accent" : "text-zk-text hover:bg-zk-raised"
    }`}
  >
    {children}
  </button>
);

const BrushPopover: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && !ref.current?.contains(t) && !t.closest("[data-brush-chip]")) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 flex h-[360px] w-[600px] overflow-hidden rounded-[6px] bg-zk-surface shadow-[0_14px_44px_rgba(0,0,0,0.35)]"
    >
      <PanelVariantContext.Provider value="popover">
        <div className="min-w-0 flex-1 pt-2">
          <BrushLibrary onPicked={onClose} />
        </div>
        <div className="w-[230px] shrink-0 border-l border-zk-hairline pt-2">
          <PresetsBody />
        </div>
      </PanelVariantContext.Provider>
    </div>
  );
};

const BottomBar: React.FC<{ onFit: () => void }> = observer(({ onFit }) => {
  const canvasStore = useCanvasStore();
  const settingsStore = useSettingsStore();
  const [popover, setPopover] = useState(false);
  const tool = canvasStore.activeTool;
  const style = canvasStore.currentBrushStyle;
  const erasing = tool === "brush" && style === "eraser";
  const drawing = tool === "brush" && style !== "eraser";
  const brushKey = style === "eraser" ? lastBrush() : style;
  const brush = brushRegistry.get(brushKey);
  const deckHasPanels = panelsIn("bottom").length > 0;
  const deckOpen = dockLayout.state.deckOpen && deckHasPanels;
  const bs = canvasStore.brushSettings;

  const openBrushes = () => {
    const dock = dockLayout.state.panels.brushes.dock;
    if (dockLayout.state.layout === "minimal") {
      setPopover((v) => !v);
      return;
    }
    if (dock === "bottom" && deckOpen && !dockLayout.state.panels.brushes.collapsed) {
      setDeckOpen(false);
      return;
    }
    revealPanel("brushes");
  };

  return (
    <div
      role="toolbar"
      aria-label="Drawing"
      className="relative flex h-14 shrink-0 items-center gap-3 border-t border-zk-hairline bg-zk-surface px-3 text-zk-text"
    >
      <div className="flex gap-0.5">
        <ToolButton label="Select (V)" active={tool === "select"} onClick={() => canvasStore.setActiveTool("select")}>
          <MousePointer2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton
          label="Draw (2)"
          active={drawing}
          onClick={() => selectBrush(canvasStore, style === "eraser" ? lastBrush() : style)}
        >
          <Pencil className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton
          label="Erase (3)"
          active={erasing}
          onClick={() => {
            canvasStore.setBrushStyle("eraser");
            canvasStore.setActiveTool("brush");
          }}
        >
          <Eraser className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton label="Shapes (5)" active={tool === "shape"} onClick={() => canvasStore.setActiveTool("shape")}>
          <Shapes className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </ToolButton>
        <ToolButton label="Pan (hold Space)" active={tool === "pan"} onClick={() => canvasStore.setActiveTool("pan")}>
          <Hand className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </ToolButton>
      </div>
      <Divider />

      {(drawing || tool === "select" || tool === "pan") && (
        <div className="relative flex items-center gap-3">
          <button
            data-brush-chip
            aria-label={`Brush: ${brush?.label ?? brushKey}. Show brushes`}
            onClick={openBrushes}
            className={`flex h-10 items-center gap-2 rounded-[4px] pr-2.5 pl-1.5 ${
              popover || (deckOpen && dockLayout.state.panels.brushes.dock === "bottom") ? "bg-zk-hover" : "bg-zk-raised hover:bg-zk-hover"
            }`}
          >
            <img
              src={`/brushes/previews/${brushKey}.png`}
              alt=""
              className="h-6 w-[68px] object-contain"
              style={{ filter: "invert(0.92)" }}
            />
            <span className="hidden max-w-[110px] truncate text-[13px] font-medium min-[900px]:inline">{brush?.label ?? brushKey}</span>
            <ChevronUp className="h-3 w-3 text-zk-muted" />
          </button>
          {popover && <BrushPopover onClose={() => setPopover(false)} />}
          {drawing && (
            <>
              <div className="w-[112px] min-[900px]:w-[136px]">
                <StrokeTrack
                  dense
                  kind="size"
                  label="Size"
                  value={canvasStore.currentSize}
                  display={`${canvasStore.currentSize} px`}
                  min={1}
                  max={brush?.maxSize ?? 100}
                  step={1}
                  onChange={(v) => canvasStore.setPenSize(v)}
                />
              </div>
              <div className="w-[112px] min-[900px]:w-[136px]">
                <StrokeTrack
                  dense
                  kind="opacity"
                  color={canvasStore.currentColor}
                  label="Opacity"
                  value={bs.opacity ?? 1}
                  display={`${Math.round((bs.opacity ?? 1) * 100)}%`}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => canvasStore.setBrushSettings({ opacity: v })}
                />
              </div>
            </>
          )}
        </div>
      )}

      {erasing && (
        <div className="flex items-center gap-3">
          <div className="w-[160px]">
            <StrokeTrack
              dense
              kind="size"
              label="Eraser size"
              value={canvasStore.eraserSize}
              display={`${canvasStore.eraserSize} px`}
              min={1}
              max={100}
              step={1}
              onChange={(v) => canvasStore.setEraserSize(v)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zk-text-2">
            <input
              type="checkbox"
              checked={settingsStore.eraserWholeStroke}
              onChange={(e) => settingsStore.setEraserWholeStroke(e.target.checked)}
              className="h-4 w-4 accent-[var(--zk-accent)]"
            />
            Whole strokes
          </label>
        </div>
      )}

      {tool === "shape" && (
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {SHAPES.map(({ kind, label, Icon }, i) => (
              <ToolButton
                key={kind}
                label={`${label} (${i + 1})`}
                active={canvasStore.currentShapeType === kind}
                onClick={() => canvasStore.setCurrentShapeType(kind)}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.5} />
              </ToolButton>
            ))}
          </div>
          <div className="w-[136px]">
            <StrokeTrack
              dense
              kind="size"
              label="Stroke"
              value={canvasStore.shapeStrokeWidth}
              display={`${canvasStore.shapeStrokeWidth} px`}
              min={1}
              max={50}
              step={1}
              onChange={(v) => canvasStore.setShapeStrokeWidth(v)}
            />
          </div>
        </div>
      )}

      <Divider />
      <div className="flex items-center gap-1.5">
        <button
          aria-label={`Colour ${canvasStore.currentColor}. Show colour panel`}
          onClick={() => revealPanel("colour")}
          className="h-7 w-7 rounded-[4px]"
          style={{
            backgroundColor: canvasStore.currentColor,
            boxShadow: "0 0 0 1px var(--zk-surface), 0 0 0 2px #ECEBE7",
          }}
        />
        <div className="hidden gap-1.5 min-[1200px]:flex">
          {SWATCHES.slice(0, 7).map((s) => (
            <button
              key={s.hex}
              aria-label={s.name}
              onClick={() => canvasStore.setColor(s.hex)}
              className="h-5 w-5 rounded-[3px]"
              style={{ backgroundColor: s.hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-0.5 text-[12px] tabular-nums min-[1000px]:flex">
        <button aria-label="Zoom out" onClick={() => canvasStore.setZoom(Math.max(0.1, canvasStore.zoom / 1.2))} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-raised">
          −
        </button>
        <span className="w-11 text-center">{Math.round(canvasStore.zoom * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => canvasStore.setZoom(Math.min(5, canvasStore.zoom * 1.2))} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-raised">
          +
        </button>
        <button aria-label="Fit to screen" title="Fit to screen" onClick={onFit} className="flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-zk-raised">
          <Maximize2 className="h-[15px] w-[15px]" strokeWidth={1.5} />
        </button>
      </div>

      {deckHasPanels && (
        <>
          <Divider />
          <button
            onClick={() => setDeckOpen(!dockLayout.state.deckOpen)}
            aria-expanded={deckOpen}
            className={`flex h-9 items-center gap-2 rounded-[4px] px-3 text-[12px] ${
              deckOpen ? "bg-zk-raised" : "hover:bg-zk-raised"
            }`}
          >
            <span className="hidden min-[1100px]:inline">Brush deck</span>
            {deckOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  );
});

export default BottomBar;
