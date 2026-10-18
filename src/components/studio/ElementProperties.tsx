import type React from "react";
import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { elementKind } from "@/engine/types";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowIcon,
  CopyIcon,
  LayerDownIcon,
  LayerUpIcon,
  LineIcon,
  TrashIcon,
} from "@/components/icons";
import StrokeTrack from "./StrokeTrack";
import { SWATCHES } from "./panels/ColourPanel";

type Variant = "card" | "panel";

const WIDTHS = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 8 },
];

export const HEADS = [
  { id: "none", label: "None" },
  { id: "arrow", label: "Arrow" },
  { id: "triangle", label: "Triangle" },
  { id: "dot", label: "Dot" },
] as const;

export const SIZES = [
  { label: "S", value: 16 },
  { label: "M", value: 24 },
  { label: "L", value: 36 },
  { label: "XL", value: 56 },
];

export const FAMILIES = [
  { id: "hand", label: "Hand", font: '"Kalam", cursive' },
  { id: "sans", label: "Sans", font: '"Instrument Sans", sans-serif' },
  { id: "mono", label: "Mono", font: '"JetBrains Mono", monospace' },
] as const;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zk-muted">{label}</span>
    {children}
  </div>
);

export function Segmented<T extends string | number>({
  options,
  value,
  onPick,
  label,
}: {
  options: readonly { id: T; label: string; icon?: React.ReactNode; style?: React.CSSProperties }[];
  value: T | null;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[4px] bg-zk-raised p-0.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            role="radio"
            aria-checked={on}
            aria-label={o.icon ? o.label : undefined}
            title={o.label}
            onClick={() => onPick(o.id)}
            style={o.style}
            className={`flex h-7 flex-1 items-center justify-center rounded-[3px] px-2 text-[12px] font-semibold transition-colors ${
              on ? "bg-zk-selected text-zk-accent" : "text-zk-text-2 hover:text-zk-text"
            }`}
          >
            {o.icon ?? o.label}
          </button>
        );
      })}
    </div>
  );
}

export const Swatches: React.FC<{ value: string | null; onPick: (hex: string | null) => void; allowNone?: boolean; label: string }> = ({
  value,
  onPick,
  allowNone,
  label,
}) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
    {allowNone && (
      <button
        role="radio"
        aria-checked={value === null}
        aria-label="No fill"
        onClick={() => onPick(null)}
        className={`relative h-6 w-6 overflow-hidden rounded-[3px] bg-zk-raised ${value === null ? "ring-2 ring-zk-accent" : ""}`}
      >
        <span className="absolute top-1/2 left-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#E5644D]" />
      </button>
    )}
    {SWATCHES.slice(0, 7).map((s) => (
      <button
        key={s.hex}
        role="radio"
        aria-checked={value?.toLowerCase() === s.hex.toLowerCase()}
        aria-label={s.name}
        onClick={() => onPick(s.hex)}
        className={`h-6 w-6 rounded-[3px] ${value?.toLowerCase() === s.hex.toLowerCase() ? "ring-2 ring-zk-accent ring-offset-1 ring-offset-zk-surface" : ""}`}
        style={{ backgroundColor: s.hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
      />
    ))}
  </div>
);

const ElementProperties: React.FC<{ variant: Variant }> = observer(({ variant }) => {
  const canvasStore = useCanvasStore();
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = canvasStore.selectedDrawElements as any[];
  const hasSelection = canvasStore.hasSelection;
  const tool = canvasStore.activeTool;
  const kinds = new Set(selected.map((e) => elementKind(e)));
  const shapes = selected.filter((e) => elementKind(e) === "shape");
  const arrows = selected.filter((e) => elementKind(e) === "arrow");
  const vectors = [...shapes, ...arrows];
  const texts = canvasStore.selectedTextTargets as any[];

  const showShape = hasSelection ? kinds.has("shape") : tool === "shape";
  const showArrow = hasSelection ? kinds.has("arrow") : tool === "arrow";
  const showText = hasSelection ? texts.length > 0 : tool === "text";
  const showLook = showShape || showArrow;
  const showStroke = showLook || (hasSelection ? kinds.has("text") || kinds.has("stroke") : tool === "text");

  const commit = () => canvasStore.saveCurrentStateToHistory();
  const commitSoon = () => {
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(commit, 400);
  };

  const first = selected[0];
  const strokeColor = hasSelection
    ? (first?.strokeColor ?? first?.color ?? canvasStore.currentColor)
    : canvasStore.currentColor;
  const width = hasSelection
    ? (vectors[0]?.strokeWidth ?? null)
    : tool === "arrow"
      ? canvasStore.arrowStrokeWidth
      : canvasStore.shapeStrokeWidth;
  const look = hasSelection ? (vectors[0]?.look ?? null) : canvasStore.elementLook;
  const fill = hasSelection ? (shapes[0]?.fillColor ?? null) : canvasStore.shapeFillColor;
  const rectangles = hasSelection ? shapes.filter((s) => s.shapeType === "rectangle") : [];
  const showCorners = hasSelection ? rectangles.length > 0 : tool === "shape" && canvasStore.currentShapeType === "rectangle";
  const corners = hasSelection ? rectangles[0]?.cornerRadius ?? 0 : canvasStore.shapeCornerRadius;
  const startHead = hasSelection ? arrows[0]?.startHead : canvasStore.arrowKind === "line" ? "none" : canvasStore.arrowStartHead;
  const endHead = hasSelection ? arrows[0]?.endHead : canvasStore.arrowKind === "line" ? "none" : canvasStore.arrowEndHead;
  const t0 = texts[0];
  const family = t0?.fontFamily ?? canvasStore.textFontFamily;
  const size = t0?.fontSize ?? canvasStore.textFontSize;
  const align = t0?.align ?? canvasStore.textAlign;
  const opacityTargets = hasSelection ? selected : [];
  const opacity = hasSelection ? (first?.opacity ?? 1) : canvasStore.shapeOpacity;

  if (!showStroke && !showText && !hasSelection) {
    return variant === "panel" ? (
      <p className="px-3 pb-3 text-[12px] leading-relaxed text-zk-muted">
        Pick a shape, arrow or text tool, or select something to edit it here.
      </p>
    ) : null;
  }

  return (
    <div className={`flex flex-col gap-3.5 ${variant === "panel" ? "px-3 pb-3" : ""}`}>
      {showStroke && (
        <Row label="Stroke">
          <Swatches
            label="Stroke colour"
            value={strokeColor}
            onPick={(hex) => {
              if (!hex) return;
              canvasStore.setColorTarget("stroke");
              canvasStore.setColor(hex);
              if (hasSelection) commit();
            }}
          />
        </Row>
      )}

      {showShape && (
        <Row label="Fill">
          <Swatches
            label="Fill colour"
            allowNone
            value={fill}
            onPick={(hex) => {
              if (hasSelection) {
                shapes.forEach((s) => s.setFillColor(hex));
                commit();
              } else canvasStore.setShapeFillColor(hex);
            }}
          />
        </Row>
      )}

      {showLook && (
        <Row label="Stroke width">
          <Segmented
            label="Stroke width"
            options={WIDTHS.map((w) => ({ id: w.value, label: w.label }))}
            value={width}
            onPick={(v) => {
              if (hasSelection) {
                vectors.forEach((e) => e.setStrokeWidth(v));
                commit();
              } else if (tool === "arrow") canvasStore.setArrowStrokeWidth(v);
              else canvasStore.setShapeStrokeWidth(v);
            }}
          />
        </Row>
      )}

      {showLook && (
        <Row label="Look">
          <Segmented
            label="Look"
            options={[
              { id: "clean", label: "Clean" },
              { id: "sketchy", label: "Sketchy" },
            ]}
            value={look as "clean" | "sketchy" | null}
            onPick={(v) => {
              canvasStore.setElementLook(v);
              if (hasSelection) {
                vectors.forEach((e) => e.setLook(v));
                commit();
              }
            }}
          />
        </Row>
      )}

      {showCorners && (
        <Row label="Corners">
          <Segmented
            label="Corners"
            options={[
              { id: "sharp", label: "Sharp" },
              { id: "round", label: "Round" },
            ]}
            value={corners > 0 ? "round" : "sharp"}
            onPick={(v) => {
              const r = v === "round" ? 8 : 0;
              if (hasSelection) {
                rectangles.forEach((s) => s.setCornerRadius(r));
                commit();
              } else canvasStore.setShapeCornerRadius(r);
            }}
          />
        </Row>
      )}

      {showArrow && !hasSelection && (
        <Row label="Kind">
          <Segmented
            label="Arrow or line"
            options={[
              { id: "arrow", label: "Arrow", icon: <ArrowIcon size={16} /> },
              { id: "line", label: "Line", icon: <LineIcon size={16} /> },
            ]}
            value={canvasStore.arrowKind as "arrow" | "line"}
            onPick={(v) => canvasStore.setArrowKind(v)}
          />
        </Row>
      )}

      {showArrow && (hasSelection || canvasStore.arrowKind === "arrow") && (
        <>
          <Row label="Start">
            <Segmented
              label="Start head"
              options={HEADS}
              value={startHead as any}
              onPick={(v) => {
                if (hasSelection) {
                  arrows.forEach((a) => a.setHeads(v, a.endHead));
                  commit();
                } else canvasStore.setArrowHeads(v, canvasStore.arrowEndHead as any);
              }}
            />
          </Row>
          <Row label="End">
            <Segmented
              label="End head"
              options={HEADS}
              value={endHead as any}
              onPick={(v) => {
                if (hasSelection) {
                  arrows.forEach((a) => a.setHeads(a.startHead, v));
                  commit();
                } else canvasStore.setArrowHeads(canvasStore.arrowStartHead as any, v);
              }}
            />
          </Row>
        </>
      )}

      {showText && (
        <>
          <Row label="Font">
            <Segmented
              label="Font"
              options={FAMILIES.map((f) => ({ id: f.id, label: f.label, style: { fontFamily: f.font } }))}
              value={family}
              onPick={(v) => {
                canvasStore.setTextFontFamily(v);
                if (hasSelection) {
                  texts.forEach((t) => t.setFontFamily(v));
                  commit();
                }
              }}
            />
          </Row>
          <Row label="Size">
            <Segmented
              label="Text size"
              options={SIZES.map((s) => ({ id: s.value, label: s.label }))}
              value={SIZES.some((s) => s.value === Math.round(size)) ? Math.round(size) : null}
              onPick={(v) => {
                canvasStore.setTextFontSize(v);
                if (hasSelection) {
                  texts.forEach((t) => t.setFontSize(v));
                  commit();
                }
              }}
            />
          </Row>
          {(!hasSelection || texts.some((t) => !t.containerId)) && (
            <Row label="Align">
              <Segmented
                label="Text align"
                options={[
                  { id: "left", label: "Left", icon: <AlignLeftIcon size={16} /> },
                  { id: "center", label: "Centre", icon: <AlignCenterIcon size={16} /> },
                  { id: "right", label: "Right", icon: <AlignRightIcon size={16} /> },
                ]}
                value={align}
                onPick={(v) => {
                  canvasStore.setTextAlign(v);
                  if (hasSelection) {
                    texts.filter((t) => !t.containerId).forEach((t) => t.setAlign(v));
                    commit();
                  }
                }}
              />
            </Row>
          )}
        </>
      )}

      {(hasSelection || showLook) && (
        <StrokeTrack
          compact
          kind="flat"
          label="Opacity"
          value={Math.round(opacity * 100)}
          display={`${Math.round(opacity * 100)}%`}
          min={5}
          max={100}
          step={1}
          onChange={(v) => {
            if (hasSelection) {
              opacityTargets.forEach((e) => e.setOpacity?.(v / 100));
              commitSoon();
            } else canvasStore.setShapeOpacity(v / 100);
          }}
        />
      )}

      {hasSelection && selected.length > 0 && (
        <div className="flex gap-1">
          {[
            { label: "Send to back", Icon: LayerDownIcon, run: () => canvasStore.reorderSelection("back") },
            { label: "Bring to front", Icon: LayerUpIcon, run: () => canvasStore.reorderSelection("front") },
            { label: "Duplicate (Ctrl+D)", Icon: CopyIcon, run: () => canvasStore.duplicateSelection() },
            { label: "Delete", Icon: TrashIcon, run: () => canvasStore.removeSelectedElements() },
          ].map(({ label, Icon, run }) => (
            <button
              key={label}
              aria-label={label}
              title={label}
              onClick={run}
              className="flex h-8 flex-1 items-center justify-center rounded-[4px] bg-zk-raised text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default ElementProperties;
