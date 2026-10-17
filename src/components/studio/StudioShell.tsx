import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "@/hooks/useStores";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import {
  dockLayout,
  panelsIn,
  revealPanel,
  setDeckOpen,
  setSideOpen,
} from "@/utils/dockLayout";
import DockArea from "./DockArea";
import BottomBar from "./BottomBar";
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
      <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
    ) : (
      <PanelRightOpen className="h-4 w-4" strokeWidth={1.5} />
    )}
  </button>
);

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
  const canvasStore = useCanvasStore();
  const overlay = useOverlayDocks();
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastLeft = useRef<number | null>(null);
  const s = dockLayout.state;
  const leftIds = panelsIn("left");
  const rightIds = panelsIn("right");
  const leftVisible = s.leftOpen && leftIds.length > 0;
  const rightVisible = s.rightOpen && rightIds.length > 0;
  const deckVisible = s.deckOpen && panelsIn("bottom").length > 0;
  const layersDock = s.panels.layers.dock;
  const layersShown =
    layersDock === "left" ? leftVisible : layersDock === "right" ? rightVisible : deckVisible;
  const stripSide = layersDock === "left" ? "left" : "right";
  const leftClosedOthers = !leftVisible && leftIds.some((id) => id !== "layers");
  const rightClosedOthers = !rightVisible && rightIds.some((id) => id !== "layers");

  const syncLeft = () => {
    const el = viewportRef.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    if (lastLeft.current !== null && left !== lastLeft.current) {
      canvasStore.setPan(canvasStore.panX - (left - lastLeft.current), canvasStore.panY);
    }
    lastLeft.current = left;
  };

  useLayoutEffect(syncLeft);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncLeft());
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasStore]);

  useEffect(() => {
    if (!overlay) return;
    const el = viewportRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest("[data-canvas-root]")) return;
      if (dockLayout.state.leftOpen) setSideOpen("left", false);
      if (dockLayout.state.rightOpen) setSideOpen("right", false);
      if (dockLayout.state.deckOpen) setDeckOpen(false);
    };
    el.addEventListener("pointerdown", onDown, true);
    return () => el.removeEventListener("pointerdown", onDown, true);
  }, [overlay]);

  return (
    <div className="fixed inset-0 flex flex-col bg-zk-surface font-ui">
      <div className="flex min-h-0 flex-1">
        {leftVisible && !overlay && <DockArea dock="left" />}
        <div ref={viewportRef} data-canvas-viewport className="relative min-w-0 flex-1 overflow-hidden">
          {children}
          {overlay && leftVisible && (
            <div className="absolute top-14 bottom-0 left-0 z-20">
              <DockArea dock="left" overlay />
            </div>
          )}
          {overlay && rightVisible && (
            <div className="absolute top-14 bottom-0 right-0 z-20">
              <DockArea dock="right" overlay />
            </div>
          )}
          {overlay && deckVisible && (
            <div className="absolute inset-x-0 bottom-0 z-20 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
              <DockArea dock="bottom" overlay />
            </div>
          )}
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
        {rightVisible && !overlay && <DockArea dock="right" />}
      </div>
      {deckVisible && !overlay && <DockArea dock="bottom" />}
      <BottomBar onFit={onFit} />
    </div>
  );
});

export default StudioShell;
