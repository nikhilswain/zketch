import type React from "react";
import { observer } from "mobx-react-lite";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { dockLayout, panelsIn, revealPanel, setSideOpen } from "@/utils/dockLayout";
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

const StudioShell: React.FC<StudioShellProps> = observer(({ topLeft, topRight, onFit, children }) => {
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

  return (
    <div className="fixed inset-0 flex flex-col bg-zk-surface font-ui">
      <div className="flex min-h-0 flex-1">
        {leftVisible && <DockArea dock="left" />}
        <div data-canvas-viewport className="relative min-w-0 flex-1 overflow-hidden">
          {children}
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
        {rightVisible && <DockArea dock="right" />}
      </div>
      {deckVisible && <DockArea dock="bottom" />}
      <BottomBar onFit={onFit} />
    </div>
  );
});

export default StudioShell;
