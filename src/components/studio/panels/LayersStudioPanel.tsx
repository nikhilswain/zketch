import type React from "react";
import { observer } from "mobx-react-lite";
import { LayersIcon } from "@/components/icons";
import { useCanvasStore } from "@/hooks/useStores";
import LayersPanel, { LayersActions, useLayerThumbnail } from "@/components/layers-panel";
import PanelFrame from "../PanelFrame";
import { useStudio } from "../StudioContext";

const StripThumb: React.FC<{ layer: any; active: boolean; onSelect: () => void }> = observer(
  ({ layer, active, onSelect }) => {
    const thumbnail = useLayerThumbnail(layer);
    return (
      <button
        onClick={onSelect}
        aria-label={`Layer: ${layer.name}${active ? ", active" : ""}`}
        aria-pressed={active}
        className="flex flex-col items-center gap-0.5"
      >
        <span
          className="block h-[30px] w-11 overflow-hidden rounded-[3px] bg-[#FBFAF6]"
          style={{ opacity: layer.visible ? 1 : 0.35 }}
        >
          {thumbnail && <img src={thumbnail} alt="" className="h-full w-full object-cover" />}
        </span>
        <span
          className="h-[2px] w-11 rounded-[1px]"
          style={{ background: active ? "var(--zk-accent)" : "transparent" }}
        />
      </button>
    );
  },
);

export const LayersStrip: React.FC<{ onExpand: () => void }> = observer(({ onExpand }) => {
  const canvasStore = useCanvasStore();
  const layers = [...canvasStore.layers].reverse();
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[6px] bg-zk-surface px-1.5 py-2">
      <button
        onClick={onExpand}
        aria-label="Show layers"
        className="flex h-7 w-9 items-center justify-center rounded-[4px] text-zk-text hover:bg-zk-hover"
      >
        <LayersIcon size={16} />
      </button>
      {layers.slice(0, 8).map((layer) => (
        <StripThumb
          key={layer.id}
          layer={layer}
          active={layer.id === canvasStore.activeLayerId}
          onSelect={() => canvasStore.setActiveLayer(layer.id)}
        />
      ))}
      {layers.length > 8 && (
        <span className="text-[10px] text-zk-muted">+{layers.length - 8}</span>
      )}
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
