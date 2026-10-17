import type React from "react";
import { createContext, useContext } from "react";
import { observer } from "mobx-react-lite";
import {
  dockLayout,
  movePanel,
  toggleCollapsed,
  type DockId,
  type PanelId,
} from "@/utils/dockLayout";

export type PanelVariant = "deck" | "side" | "popover";

export const PanelVariantContext = createContext<PanelVariant>("side");

export const usePanelVariant = () => useContext(PanelVariantContext);

export const PANEL_DRAG_TYPE = "application/x-zketch-panel";

const DOCK_BUTTONS: { dock: DockId; label: string; rect: [number, number, number, number] }[] = [
  { dock: "left", label: "Dock left", rect: [1.5, 2.5, 4, 11] },
  { dock: "bottom", label: "Dock bottom", rect: [1.5, 9.5, 13, 4] },
  { dock: "right", label: "Dock right", rect: [10.5, 2.5, 4, 11] },
];

interface PanelFrameProps {
  id: PanelId;
  title: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const PanelFrame: React.FC<PanelFrameProps> = observer(
  ({ id, title, actions, className, children }) => {
    const variant = usePanelVariant();
    const placement = dockLayout.state.panels[id];
    const collapsed = variant !== "popover" && placement.collapsed;

    return (
      <section
        aria-label={title}
        className={`flex min-h-0 flex-col ${className ?? ""}`}
      >
        {variant !== "popover" && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PANEL_DRAG_TYPE, id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex h-9 shrink-0 cursor-grab items-center gap-1.5 pl-1.5 pr-2 active:cursor-grabbing"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="#5C5B60">
              <circle cx="3" cy="3" r="1.1" />
              <circle cx="3" cy="6" r="1.1" />
              <circle cx="3" cy="9" r="1.1" />
              <circle cx="7" cy="3" r="1.1" />
              <circle cx="7" cy="6" r="1.1" />
              <circle cx="7" cy="9" r="1.1" />
            </svg>
            <button
              onClick={() => toggleCollapsed(id)}
              aria-expanded={!collapsed}
              className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-zk-muted hover:text-zk-text"
            >
              {title}
              <svg
                aria-hidden="true"
                width="9"
                height="9"
                viewBox="0 0 10 10"
                className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
              >
                <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {actions}
            <div className="ml-1 flex gap-0.5">
              {DOCK_BUTTONS.map((b) => {
                const current = placement.dock === b.dock;
                return (
                  <button
                    key={b.dock}
                    aria-label={current ? `${b.label} (current)` : b.label}
                    aria-pressed={current}
                    onClick={() => movePanel(id, b.dock)}
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-[3px] transition-colors ${
                      current ? "bg-zk-selected text-zk-accent" : "text-zk-disabled hover:text-zk-text"
                    }`}
                  >
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                      <rect x={b.rect[0]} y={b.rect[1]} width={b.rect[2]} height={b.rect[3]} fill="currentColor" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!collapsed && <div className="min-h-0 flex-1">{children}</div>}
      </section>
    );
  },
);

export default PanelFrame;
