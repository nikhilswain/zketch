import type React from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dockLayout,
  movePanel,
  panelsIn,
  setSideOpen,
  type DockId,
  type PanelId,
} from "@/utils/dockLayout";
import { PANELS } from "./panels";
import { PANEL_DRAG_TYPE, PanelVariantContext } from "./PanelFrame";

const DECK_WIDTHS: Record<PanelId, string> = {
  brushes: "flex-1 min-w-[300px]",
  presets: "w-[244px]",
  stroke: "w-[264px]",
  colour: "w-[284px]",
  layers: "w-[264px]",
  shapes: "w-[244px]",
};

function dropIndex(container: HTMLElement, dock: DockId, x: number, y: number) {
  const items = [...container.querySelectorAll<HTMLElement>("[data-panel-slot]")];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (dock === "bottom" ? x < r.left + r.width / 2 : y < r.top + r.height / 2) return i;
  }
  return items.length;
}

const DockArea: React.FC<{ dock: DockId; overlay?: boolean }> = observer(({ dock, overlay }) => {
  const ids = panelsIn(dock);
  const ref = useRef<HTMLDivElement>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const side = dock !== "bottom";

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(PANEL_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (ref.current) setDropAt(dropIndex(ref.current, dock, e.clientX, e.clientY));
  };

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(PANEL_DRAG_TYPE) as PanelId;
    setDropAt(null);
    if (!id || !(id in dockLayout.state.panels) || !ref.current) return;
    e.preventDefault();
    let index = dropIndex(ref.current, dock, e.clientX, e.clientY);
    const current = ids.indexOf(id);
    if (current !== -1 && current < index) index -= 1;
    movePanel(id, dock, index);
  };

  const indicator = (i: number) =>
    dropAt === i ? (
      <div
        aria-hidden="true"
        className={side ? "mx-2 h-0.5 shrink-0 rounded bg-zk-accent" : "my-2 w-0.5 shrink-0 rounded bg-zk-accent"}
      />
    ) : null;

  return (
    <PanelVariantContext.Provider value={side ? "side" : "deck"}>
      <div
        ref={ref}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node)) setDropAt(null);
        }}
        onDrop={onDrop}
        aria-label={side ? `${dock === "left" ? "Left" : "Right"} sidebar` : "Brush deck"}
        className={
          side
            ? `flex h-full w-[300px] shrink-0 flex-col overflow-y-auto bg-zk-surface text-zk-text ${
                dock === "left" ? "border-r" : "border-l"
              } border-zk-hairline ${overlay ? "shadow-[0_0_40px_rgba(0,0,0,0.35)]" : ""}`
            : "flex h-[212px] shrink-0 overflow-x-auto border-t border-zk-hairline bg-zk-surface text-zk-text"
        }
      >
        {side && (
          <div className={`flex h-8 shrink-0 items-center px-1.5 ${dock === "left" ? "justify-end" : "justify-start"}`}>
            <button
              aria-label={`Hide ${dock} sidebar`}
              onClick={() => setSideOpen(dock as "left" | "right", false)}
              className="flex h-6 w-6 items-center justify-center rounded-[3px] text-zk-muted hover:bg-zk-hover hover:text-zk-text"
            >
              {dock === "left" ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
        {ids.map((id, i) => {
          const { Component } = PANELS[id];
          return (
            <div key={id} className="contents">
              {indicator(i)}
              <div
                data-panel-slot
                className={
                  side
                    ? "border-b border-zk-hairline pb-1 last:border-b-0"
                    : `h-full shrink-0 border-r border-zk-hairline last:border-r-0 ${DECK_WIDTHS[id]}`
                }
              >
                <Component />
              </div>
            </div>
          );
        })}
        {indicator(ids.length)}
        {ids.length === 0 && (
          <p className="m-auto px-6 text-center text-[12px] text-zk-muted">
            Drag a panel here by its grip, or use a panel&apos;s dock buttons.
          </p>
        )}
      </div>
    </PanelVariantContext.Provider>
  );
});

export default DockArea;
