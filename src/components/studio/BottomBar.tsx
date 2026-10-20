import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowIcon,
  LineIcon,
  TextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  DiamondIcon,
  EraserIcon,
  FitIcon,
  HandIcon,
  PencilIcon,
  SelectIcon,
  ShapesIcon,
  SquareIcon,
  TriangleIcon,
} from "@/components/icons";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { lastBrush, selectBrush } from "@/utils/brushMemory";
import {
  dockLayout,
  panelsIn,
  isDockShown,
  revealPanel,
  setDeckOpen,
} from "@/utils/dockLayout";
import type { ShapeKind } from "@/models/ShapeLayerModel";
import EraserModePicker from "./EraserModePicker";
import { FAMILIES, HEADS, SIZES, Segmented } from "./ElementProperties";
import LookPicker from "./LookPicker";
import type { ElementLook } from "@/engine/types";
import StrokeTrack from "./StrokeTrack";
import { PanelVariantContext } from "./PanelFrame";
import { BrushLibrary } from "./panels/BrushesPanel";
import { PresetsBody } from "./panels/PresetsPanel";
import { SWATCHES } from "./panels/ColourPanel";
import { PANELS } from "./panels";
import { visibleCanvasCenter } from "@/utils/viewport";
import { ZoomReadout } from "./ZoomCluster";

const SHAPES: { kind: ShapeKind; label: string; Icon: typeof SquareIcon }[] = [
  { kind: "rectangle", label: "Rectangle", Icon: SquareIcon },
  { kind: "circle", label: "Circle", Icon: CircleIcon },
  { kind: "diamond", label: "Diamond", Icon: DiamondIcon },
  { kind: "triangle", label: "Triangle", Icon: TriangleIcon },
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
      className="absolute bottom-full left-0 mb-2 flex h-[360px] w-[600px] overflow-hidden rounded-[6px] bg-zk-surface shadow-(--zk-shadow-pop)"
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

const ToolLook: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  return (
    <div className="w-[230px]">
      <LookPicker value={canvasStore.elementLook as ElementLook} onPick={(v) => canvasStore.setElementLook(v)} />
    </div>
  );
});

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
  const deckOpen = isDockShown("bottom");
  const bs = canvasStore.brushSettings;

  useEffect(() => {
    if (!drawing) setPopover(false);
  }, [drawing]);

  const zoomBy = (factor: number) => {
    const c = visibleCanvasCenter();
    canvasStore.zoomAt(canvasStore.zoom * factor, c.x, c.y);
  };

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
          <SelectIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton
          label="Draw (2)"
          active={drawing}
          onClick={() => selectBrush(canvasStore, style === "eraser" ? lastBrush() : style)}
        >
          <PencilIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton
          label="Erase (3)"
          active={erasing}
          onClick={() => {
            canvasStore.setBrushStyle("eraser");
            canvasStore.setActiveTool("brush");
          }}
        >
          <EraserIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton label="Shapes (5)" active={tool === "shape"} onClick={() => canvasStore.setActiveTool("shape")}>
          <ShapesIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton
          label="Arrow (A)"
          active={tool === "arrow"}
          onClick={() => {
            canvasStore.setArrowKind("arrow");
            canvasStore.setActiveTool("arrow");
          }}
        >
          <ArrowIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton label="Text (T)" active={tool === "text"} onClick={() => canvasStore.setActiveTool("text")}>
          <TextIcon className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton label="Pan (or hold Space)" active={tool === "pan"} onClick={() => canvasStore.setActiveTool("pan")}>
          <HandIcon className="h-[18px] w-[18px]" />
        </ToolButton>
      </div>
      <Divider />

      {drawing && (
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
            <ChevronUpIcon className="h-3 w-3 text-zk-muted" />
          </button>
          {popover && <BrushPopover onClose={() => setPopover(false)} />}
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
          <EraserModePicker />
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
                <Icon className="h-[17px] w-[17px]" />
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
          <ToolLook />
        </div>
      )}

      {tool === "arrow" && (
        <div className="flex items-center gap-3">
          <Segmented
            label="Arrow or line"
            options={[
              { id: "arrow", label: "Arrow", icon: <ArrowIcon size={16} /> },
              { id: "line", label: "Line", icon: <LineIcon size={16} /> },
            ]}
            value={canvasStore.arrowKind as "arrow" | "line"}
            onPick={(v) => canvasStore.setArrowKind(v)}
          />
          {canvasStore.arrowKind === "arrow" && (
            <Segmented
              label="Start head"
              options={HEADS}
              value={canvasStore.arrowStartHead as any}
              onPick={(v) => canvasStore.setArrowHeads(v, canvasStore.arrowEndHead as any)}
            />
          )}
          {canvasStore.arrowKind === "arrow" && (
            <Segmented
              label="End head"
              options={HEADS}
              value={canvasStore.arrowEndHead as any}
              onPick={(v) => canvasStore.setArrowHeads(canvasStore.arrowStartHead as any, v)}
            />
          )}
          <div className="w-[136px]">
            <StrokeTrack
              dense
              kind="size"
              label="Stroke"
              value={canvasStore.arrowStrokeWidth}
              display={`${canvasStore.arrowStrokeWidth} px`}
              min={1}
              max={50}
              step={1}
              onChange={(v) => canvasStore.setArrowStrokeWidth(v)}
            />
          </div>
          <ToolLook />
        </div>
      )}

      {tool === "text" && (
        <div className="flex items-center gap-3">
          <Segmented
            label="Font"
            options={FAMILIES.map((f) => ({ id: f.id, label: f.label, style: { fontFamily: f.font } }))}
            value={canvasStore.textFontFamily as any}
            onPick={(v) => canvasStore.setTextFontFamily(v)}
          />
          <Segmented
            label="Text size"
            options={SIZES.map((s) => ({ id: s.value, label: s.label }))}
            value={canvasStore.textFontSize}
            onPick={(v) => canvasStore.setTextFontSize(v)}
          />
          <Segmented
            label="Text align"
            options={[
              { id: "left", label: "Left", icon: <AlignLeftIcon size={16} /> },
              { id: "center", label: "Centre", icon: <AlignCenterIcon size={16} /> },
              { id: "right", label: "Right", icon: <AlignRightIcon size={16} /> },
            ]}
            value={canvasStore.textAlign as any}
            onPick={(v) => canvasStore.setTextAlign(v)}
          />
        </div>
      )}

      {(drawing || erasing || tool === "shape" || tool === "arrow" || tool === "text") && <Divider />}
      <div className="flex items-center gap-1.5">
        <button
          aria-label={`Colour ${canvasStore.displayColor ?? "none"}. Show colour panel`}
          onClick={() => revealPanel("colour")}
          className="h-7 w-7 rounded-[4px]"
          style={{
            backgroundColor: canvasStore.displayColor ?? "transparent",
            backgroundImage: canvasStore.displayColor
              ? undefined
              : "linear-gradient(45deg, transparent 46%, #E5644D 46%, #E5644D 54%, transparent 54%)",
            boxShadow: "0 0 0 1px var(--zk-surface), 0 0 0 2px var(--zk-ring-strong)",
          }}
        />
        <div className="hidden gap-1.5 min-[1200px]:flex">
          {SWATCHES.slice(0, 7).map((s) => (
            <button
              key={s.hex}
              aria-label={s.name}
              onClick={() => canvasStore.setColor(s.hex)}
              className="h-5 w-5 rounded-[3px]"
              style={{ backgroundColor: s.hex, boxShadow: "inset 0 0 0 1px var(--zk-swatch-edge)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-0.5 text-[12px] tabular-nums min-[1000px]:flex">
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-raised">
          −
        </button>
        <span className="w-11 text-center">
          <ZoomReadout />
        </span>
        <button aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-raised">
          +
        </button>
        <button aria-label="Fit to screen" title="Fit to screen" onClick={onFit} className="flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-zk-raised">
          <FitIcon className="h-[15px] w-[15px]" />
        </button>
      </div>

      {deckHasPanels && (
        <>
          <Divider />
          <button
            onClick={() => setDeckOpen(!deckOpen)}
            aria-expanded={deckOpen}
            aria-label={deckOpen ? "Hide bottom panels" : "Show bottom panels"}
            title={`${deckOpen ? "Hide" : "Show"} ${panelsIn("bottom").map((id) => PANELS[id].title.toLowerCase()).join(", ")}`}
            className={`flex h-9 items-center gap-2 rounded-[4px] px-3 text-[12px] ${
              deckOpen ? "bg-zk-raised" : "hover:bg-zk-raised"
            }`}
          >
            <span className="hidden min-[1100px]:inline">Panels</span>
            {deckOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronUpIcon className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  );
});

export default BottomBar;
