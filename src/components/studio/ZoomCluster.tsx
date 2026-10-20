import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { FitIcon } from "@/components/icons";
import { visibleCanvasCenter } from "@/utils/viewport";

export const ZoomReadout: React.FC = observer(() => <>{Math.round(useCanvasStore().zoom * 100)}%</>);

const ZoomCluster: React.FC<{ onFit: () => void }> = observer(({ onFit }) => {
  const canvasStore = useCanvasStore();
  const zoomBy = (factor: number) => {
    const c = visibleCanvasCenter();
    canvasStore.zoomAt(canvasStore.zoom * factor, c.x, c.y);
  };
  return (
    <div className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-[6px] bg-zk-surface shadow-(--zk-shadow-float) px-1 text-[12px] text-zk-text tabular-nums">
      <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-hover">
        −
      </button>
      <button
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
        onClick={() => zoomBy(1 / canvasStore.zoom)}
        className="h-8 w-12 rounded-[4px] hover:bg-zk-hover"
      >
        <ZoomReadout />
      </button>
      <button aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="h-8 w-8 rounded-[4px] text-[15px] hover:bg-zk-hover">
        +
      </button>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-zk-hairline" />
      <button
        aria-label="Fit to screen"
        title="Fit to screen (Ctrl+0)"
        onClick={onFit}
        className="flex h-8 w-8 items-center justify-center rounded-[4px] hover:bg-zk-hover"
      >
        <FitIcon className="h-[17px] w-[17px]" />
      </button>
    </div>
  );
});

export default ZoomCluster;
