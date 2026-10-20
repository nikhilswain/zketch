import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  FocusIcon,
  LayersIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
  UnlockIcon,
} from "@/components/icons";
import { useCanvasStore } from "@/hooks/useStores";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LayersPanel, { LayersActions, useLayerThumbnail } from "@/components/layers-panel";
import { useSortableList } from "@/hooks/useSortableList";
import PanelFrame from "../PanelFrame";
import { useStudio } from "../StudioContext";

type SortProps = ReturnType<ReturnType<typeof useSortableList>["itemProps"]>;

const StripThumb: React.FC<{
  layer: any;
  active: boolean;
  sortProps: SortProps;
  onSelect: () => void;
  onExpand: () => void;
}> = observer(
  ({ layer, active, sortProps, onSelect, onExpand }) => {
    const canvasStore = useCanvasStore();
    const thumbnail = useLayerThumbnail(layer);
    const [menuOpen, setMenuOpen] = useState(false);
    const index = canvasStore.layers.findIndex((l: any) => l.id === layer.id);
    const isDraw = layer.type === "draw";
    return (
      <div
        {...sortProps}
        className="cursor-grab touch-none select-none rounded-[3px] data-lifted:cursor-grabbing data-lifted:shadow-(--zk-shadow-lift)"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        <button
          data-sort-handle
          onClick={onSelect}
          aria-label={`Layer: ${layer.name}${active ? ", active" : ""}`}
          aria-pressed={active}
          className="flex cursor-[inherit] flex-col items-center gap-0.5"
        >
          <span
            className="block h-[30px] w-11 overflow-hidden rounded-[3px] bg-[#FBFAF6] shadow-(--zk-mini-edge)"
            style={{ opacity: layer.visible ? 1 : 0.35 }}
          >
            {thumbnail && <img src={thumbnail} alt="" draggable={false} className="h-full w-full object-cover" />}
          </span>
          <span
            className="h-[2px] w-11 rounded-[1px]"
            style={{ background: active ? "var(--zk-accent)" : "transparent" }}
          />
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-44">
            <DropdownMenuLabel className="truncate text-[12px]">{layer.name}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => canvasStore.toggleLayerVisibility(layer.id)}>
              {layer.visible ? <EyeOffIcon className="mr-2 h-3.5 w-3.5" /> : <EyeIcon className="mr-2 h-3.5 w-3.5" />}
              {layer.visible ? "Hide" : "Show"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => canvasStore.toggleLayerLock(layer.id)}>
              {layer.locked ? <UnlockIcon className="mr-2 h-3.5 w-3.5" /> : <LockIcon className="mr-2 h-3.5 w-3.5" />}
              {layer.locked ? "Unlock" : "Lock"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => canvasStore.focusLayer(layer.id)}>
              <FocusIcon className="mr-2 h-3.5 w-3.5" />
              {canvasStore.focusedLayerId === layer.id ? "Exit focus" : "Focus (solo)"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => canvasStore.duplicateLayer(layer.id)}>
              <CopyIcon className="mr-2 h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => canvasStore.moveLayerUp(layer.id)} disabled={index === canvasStore.layers.length - 1}>
              <ChevronUpIcon className="mr-2 h-3.5 w-3.5" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => canvasStore.moveLayerDown(layer.id)} disabled={index <= 0}>
              <ChevronDownIcon className="mr-2 h-3.5 w-3.5" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExpand}>
              <LayersIcon className="mr-2 h-3.5 w-3.5" />
              Rename, opacity…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => canvasStore.clearLayer(layer.id)}
              disabled={!isDraw || (layer.strokeCount ?? 0) === 0 || layer.locked}
              className="text-orange-600 focus:text-orange-600"
            >
              <EraserIcon className="mr-2 h-3.5 w-3.5" />
              Clear strokes
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => canvasStore.removeLayer(layer.id)}
              disabled={canvasStore.layerCount <= 1}
              className="text-destructive focus:text-destructive"
            >
              <TrashIcon className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  },
);

export const LayersStrip: React.FC<{ onExpand: () => void }> = observer(({ onExpand }) => {
  const canvasStore = useCanvasStore();
  const layers = [...canvasStore.layers].reverse();
  const shown = layers.slice(0, 8);
  const { itemProps } = useSortableList(
    shown.map((l) => l.id),
    (id, to) => canvasStore.moveLayer(id, canvasStore.layers.length - 1 - to),
  );
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[6px] bg-zk-surface px-1.5 py-2">
      <button
        onClick={onExpand}
        aria-label="Show layers"
        className="flex h-7 w-9 items-center justify-center rounded-[4px] text-zk-text hover:bg-zk-hover"
      >
        <LayersIcon size={16} />
      </button>
      {shown.map((layer) => (
        <StripThumb
          key={layer.id}
          layer={layer}
          sortProps={itemProps(layer.id)}
          active={layer.id === canvasStore.activeLayerId}
          onSelect={() => canvasStore.setActiveLayer(layer.id)}
          onExpand={onExpand}
        />
      ))}
      {layers.length > 8 && (
        <span className="text-[10px] text-zk-muted">+{layers.length - 8}</span>
      )}
      <button
        onClick={() => canvasStore.addLayer()}
        aria-label="Add layer"
        title="Add layer"
        className="flex h-[30px] w-11 items-center justify-center rounded-[3px] border border-dashed border-(--zk-dashed) text-zk-muted hover:border-zk-text-2 hover:text-zk-text"
      >
        <PlusIcon size={14} />
      </button>
    </div>
  );
});

const LayersStudioPanel: React.FC = () => {
  const { onAnimationFrame, onAnimationStateChange } = useStudio();
  return (
    <PanelFrame id="layers" title="Layers" actions={<LayersActions />}>
      <LayersPanel
        embedded
        className="h-full bg-transparent"
        onAnimationFrame={onAnimationFrame}
        onAnimationStateChange={onAnimationStateChange}
      />
    </PanelFrame>
  );
};

export default LayersStudioPanel;
