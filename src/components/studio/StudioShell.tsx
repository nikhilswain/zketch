import type React from "react";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { PanelLeftOpenIcon, PanelRightOpenIcon } from "@/components/icons";
import {
  dockLayout,
  hideOverlayDocks,
  isDockShown,
  movePanel,
  panelsIn,
  revealPanel,
  setDraggingPanel,
  setOverlayMode,
  setSideOpen,
  type DockId,
  type PanelId,
} from "@/utils/dockLayout";
import DockArea from "./DockArea";
import DockSlot from "./DockSlot";
import { PANEL_DRAG_TYPE } from "./PanelFrame";
import BottomBar from "./BottomBar";
import SimpleToolbar from "./SimpleToolbar";
import PropertiesCard from "./PropertiesCard";
import ZoomCluster from "./ZoomCluster";
import { LayersStrip } from "./panels/LayersStudioPanel";

interface StudioShellProps {
  topLeft: React.ReactNode;
  topRight: React.ReactNode;
  onFit: () => void;
  children: React.ReactNode;
}

const ReopenTab: React.FC<{ side: "left" | "right" }> = ({ side }) => (
  <button
    aria-label={`Show ${side} sidebar`}
    onClick={() => setSideOpen(side, true)}
    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-[6px] bg-zk-surface text-zk-text hover:bg-zk-hover"
  >
    {side === "left" ? (
      <PanelLeftOpenIcon className="h-4 w-4" />
    ) : (
      <PanelRightOpenIcon className="h-4 w-4" />
    )}
  </button>
);

const ZONE_LABEL: Record<DockId, string> = { left: "Dock left", right: "Dock right", bottom: "Dock at the bottom" };

const ZONE_POSITION: Record<DockId, string> = {
  left: "top-16 bottom-4 left-3 w-28",
  right: "top-16 bottom-4 right-3 w-28",
  bottom: "bottom-3 left-36 right-36 h-20",
};

const DropZone: React.FC<{ dock: DockId }> = ({ dock }) => {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PANEL_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(PANEL_DRAG_TYPE) as PanelId;
        setOver(false);
        setDraggingPanel(null);
        if (!id || !(id in dockLayout.state.panels)) return;
        e.preventDefault();
        movePanel(id, dock);
      }}
      className={`pointer-events-auto absolute z-30 flex items-center justify-center rounded-[6px] border border-dashed text-[12px] font-semibold transition-colors duration-150 ${
        ZONE_POSITION[dock]
      } ${over ? "border-zk-accent bg-zk-accent/25 text-zk-text" : "border-zk-accent/50 bg-zk-surface/70 text-zk-text-2"}`}
    >
      <span className={dock === "bottom" ? "" : "[writing-mode:vertical-rl]"}>{ZONE_LABEL[dock]}</span>
    </div>
  );
};

const DropZones: React.FC = observer(() => {
  if (!dockLayout.dragging) return null;
  const docks = (["left", "right", "bottom"] as DockId[]).filter((d) => !isDockShown(d));
  return (
    <>
      {docks.map((d) => (
        <DropZone key={d} dock={d} />
      ))}
    </>
  );
});

const OVERLAY_QUERY = "(max-width: 1099px)";

function useOverlayDocks() {
  const [overlay, setOverlay] = useState(
    () => typeof window !== "undefined" && window.matchMedia(OVERLAY_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(OVERLAY_QUERY);
    const update = () => setOverlay(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return overlay;
}

const StudioShell: React.FC<StudioShellProps> = observer(({ topLeft, topRight, onFit, children }) => {
  const overlay = useOverlayDocks();
  const rowRef = useRef<HTMLDivElement>(null);
  const simple = dockLayout.state.layout === "simple";
  const s = dockLayout.state;
  const leftIds = panelsIn("left");
  const rightIds = panelsIn("right");
  const leftVisible = isDockShown("left");
  const rightVisible = isDockShown("right");
  const deckVisible = isDockShown("bottom");
  const layersDock = s.panels.layers.dock;
  const layersShown =
    layersDock === "left" ? leftVisible : layersDock === "right" ? rightVisible : deckVisible;
  const stripSide = layersDock === "left" ? "left" : "right";
  const leftClosedOthers = !leftVisible && leftIds.some((id) => id !== "layers");
  const rightClosedOthers = !rightVisible && rightIds.some((id) => id !== "layers");

  useEffect(() => {
    setOverlayMode(overlay);
  }, [overlay]);

  useEffect(() => {
    if (!overlay) return;
    const el = rowRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest("[data-canvas-root]")) return;
      hideOverlayDocks();
    };
    el.addEventListener("pointerdown", onDown, true);
    return () => el.removeEventListener("pointerdown", onDown, true);
  }, [overlay]);

  if (simple) {
    return (
      <div className="fixed inset-0 flex flex-col bg-zk-surface font-ui">
        <div ref={rowRef} className="relative flex min-h-0 flex-1">
          <div className="absolute inset-0 overflow-hidden">{children}</div>
          <div data-canvas-viewport className="pointer-events-none relative min-w-0 flex-1 overflow-hidden">
            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
              {topLeft}
              {topRight}
            </div>
            <div
              className={`pointer-events-none absolute z-10 flex ${
                overlay ? "inset-x-3 top-16 justify-start" : "top-3 left-1/2 max-w-[calc(100%-860px)] min-w-0 -translate-x-1/2 justify-center"
              }`}
            >
              <SimpleToolbar />
            </div>
            <div className={`pointer-events-none absolute left-3 z-10 ${overlay ? "top-[7.5rem]" : "top-16"}`}>
              <PropertiesCard />
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <ZoomCluster onFit={onFit} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zk-surface font-ui">
      <div ref={rowRef} className="relative flex min-h-0 flex-1">
        <div className="absolute inset-0 overflow-hidden">{children}</div>
        <DockSlot open={leftVisible && !overlay} axis="x" size={300} from="left" className="relative z-10">
          <DockArea dock="left" />
        </DockSlot>
        <div data-canvas-viewport className="pointer-events-none relative min-w-0 flex-1 overflow-hidden">
          <div className="pointer-events-auto absolute top-14 bottom-0 left-0 z-20 flex">
            <DockSlot open={overlay && leftVisible} axis="x" size={300} from="left" className="h-full">
              <DockArea dock="left" overlay />
            </DockSlot>
          </div>
          <div className="pointer-events-auto absolute top-14 right-0 bottom-0 z-20 flex">
            <DockSlot open={overlay && rightVisible} axis="x" size={300} from="right" className="h-full">
              <DockArea dock="right" overlay />
            </DockSlot>
          </div>
          <div className={`pointer-events-auto absolute inset-x-0 bottom-0 z-20 ${overlay && deckVisible ? "shadow-[0_-12px_40px_rgba(0,0,0,0.35)]" : ""}`}>
            <DockSlot open={overlay && deckVisible} axis="y" size={212} from="bottom">
              <DockArea dock="bottom" overlay />
            </DockSlot>
          </div>
          <DropZones />
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
            {topLeft}
            {topRight}
          </div>
          <div className="pointer-events-none absolute top-16 left-3 z-10 flex flex-col items-start gap-2">
            {leftClosedOthers && <ReopenTab side="left" />}
            {!layersShown && stripSide === "left" && (
              <div className="pointer-events-auto">
                <LayersStrip onExpand={() => revealPanel("layers")} />
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute top-16 right-3 z-10 flex flex-col items-end gap-2">
            {rightClosedOthers && <ReopenTab side="right" />}
            {!layersShown && stripSide === "right" && (
              <div className="pointer-events-auto">
                <LayersStrip onExpand={() => revealPanel("layers")} />
              </div>
            )}
          </div>
        </div>
        <DockSlot open={rightVisible && !overlay} axis="x" size={300} from="right" className="relative z-10">
          <DockArea dock="right" />
        </DockSlot>
      </div>
      <DockSlot open={deckVisible && !overlay} axis="y" size={212} from="bottom">
        <DockArea dock="bottom" />
      </DockSlot>
      <BottomBar onFit={onFit} />
    </div>
  );
});

export default StudioShell;
