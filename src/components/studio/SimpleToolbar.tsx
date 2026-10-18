import type React from "react";
import { observer } from "mobx-react-lite";
import {
  ArrowIcon,
  CircleIcon,
  DiamondIcon,
  EraserIcon,
  HandIcon,
  LineIcon,
  PencilIcon,
  SelectIcon,
  SquareIcon,
  TextIcon,
  type IconProps,
} from "@/components/icons";
import { useCanvasStore } from "@/hooks/useStores";
import { selectBrush } from "@/utils/brushMemory";

export type SimpleToolId =
  | "select"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "pen"
  | "text"
  | "eraser";

export const SIMPLE_KEYS: Record<string, SimpleToolId> = {
  "1": "select",
  v: "select",
  h: "hand",
  "2": "rectangle",
  "3": "diamond",
  "4": "ellipse",
  "5": "arrow",
  "6": "line",
  "7": "pen",
  "8": "text",
  "0": "eraser",
};

const TOOLS: { id: SimpleToolId; label: string; key: string; Icon: (p: IconProps) => React.ReactElement }[] = [
  { id: "select", label: "Select", key: "1", Icon: SelectIcon },
  { id: "hand", label: "Hand", key: "H", Icon: HandIcon },
  { id: "rectangle", label: "Rectangle", key: "2", Icon: SquareIcon },
  { id: "diamond", label: "Diamond", key: "3", Icon: DiamondIcon },
  { id: "ellipse", label: "Ellipse", key: "4", Icon: CircleIcon },
  { id: "arrow", label: "Arrow", key: "5", Icon: ArrowIcon },
  { id: "line", label: "Line", key: "6", Icon: LineIcon },
  { id: "pen", label: "Pen", key: "7", Icon: PencilIcon },
  { id: "text", label: "Text", key: "8", Icon: TextIcon },
  { id: "eraser", label: "Eraser", key: "0", Icon: EraserIcon },
];

export function pickSimpleTool(canvasStore: any, id: SimpleToolId) {
  switch (id) {
    case "select":
      return canvasStore.setActiveTool("select");
    case "hand":
      return canvasStore.setActiveTool("pan");
    case "rectangle":
    case "diamond":
    case "ellipse":
      canvasStore.setCurrentShapeType(id === "ellipse" ? "circle" : id);
      return canvasStore.setActiveTool("shape");
    case "arrow":
    case "line":
      canvasStore.setArrowKind(id);
      return canvasStore.setActiveTool("arrow");
    case "pen":
      return selectBrush(canvasStore, "ink");
    case "text":
      return canvasStore.setActiveTool("text");
    case "eraser":
      canvasStore.setBrushStyle("eraser");
      return canvasStore.setActiveTool("brush");
  }
}

export function activeSimpleTool(canvasStore: any): SimpleToolId | null {
  const tool = canvasStore.activeTool;
  if (tool === "select") return "select";
  if (tool === "pan") return "hand";
  if (tool === "text") return "text";
  if (tool === "arrow") return canvasStore.arrowKind === "line" ? "line" : "arrow";
  if (tool === "shape") {
    const k = canvasStore.currentShapeType;
    return k === "circle" ? "ellipse" : k === "diamond" ? "diamond" : k === "rectangle" ? "rectangle" : null;
  }
  if (tool === "brush") return canvasStore.currentBrushStyle === "eraser" ? "eraser" : "pen";
  return null;
}

const SimpleToolbar: React.FC = observer(() => {
  const canvasStore = useCanvasStore();
  const active = activeSimpleTool(canvasStore);
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className="pointer-events-auto flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-[6px] bg-zk-surface px-1 text-zk-text"
    >
      {TOOLS.map(({ id, label, key, Icon }) => {
        const on = active === id;
        return (
          <button
            key={id}
            aria-label={`${label} (${key})`}
            aria-pressed={on}
            title={`${label} — ${key}`}
            onClick={() => pickSimpleTool(canvasStore, id)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] transition-colors ${
              on ? "bg-zk-selected text-zk-accent" : "text-zk-text-2 hover:bg-zk-hover hover:text-zk-text"
            }`}
          >
            <Icon size={18} />
            <span className="absolute right-0.5 bottom-0 text-[8px] font-semibold text-zk-muted tabular-nums">{key}</span>
          </button>
        );
      })}
    </div>
  );
});

export default SimpleToolbar;
