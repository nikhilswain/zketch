import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { visibleCanvasCenter } from "@/utils/viewport";

const ZoomCluster: React.FC<{ onFit: () => void }> = observer(({ onFit }) => {
  const canvasStore = useCanvasStore();
  const zoomBy = (factor: number) => {
    const c = visibleCanvasCenter();
    canvasStore.zoomAt(canvasStore.zoom * factor, c.x, c.y);
  };
  return (
    <div className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-[6px] bg-zk-surface px-1 text-[12px] text-zk-text tabular-nums">
      <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-hover">
        −
      </button>
      <button aria-label="Fit to screen" title="Fit to screen" onClick={onFit} className="h-8 w-12 rounded-[4px] hover:bg-zk-hover">
        {Math.round(canvasStore.zoom * 100)}%
      </button>
      <button aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-hover">
        +
      </button>
    </div>
  );
});

export default ZoomCluster;
