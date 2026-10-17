import type React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  ChevronRightIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  GripIcon,
  type IconProps,
} from "@/components/icons";
import {
  dockLayout,
  movePanel,
  setDraggingPanel,
  toggleCollapsed,
  type DockId,
  type PanelId,
} from "@/utils/dockLayout";

export type PanelVariant = "deck" | "side" | "popover";

export const PanelVariantContext = createContext<PanelVariant>("side");

export const usePanelVariant = () => useContext(PanelVariantContext);

export const PANEL_DRAG_TYPE = "application/x-zketch-panel";

const Reveal: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => {
  const [mounted, setMounted] = useState(open);
  const [settled, setSettled] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSettled(false);
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setSettled(true);
      }}
      className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className={`min-h-0 ${open && settled ? "" : "overflow-hidden"}`}>{mounted && children}</div>
    </div>
  );
};

const DOCK_BUTTONS: { dock: DockId; label: string; Icon: (props: IconProps) => React.ReactElement }[] = [
  { dock: "left", label: "Dock left", Icon: DockLeftIcon },
  { dock: "bottom", label: "Dock bottom", Icon: DockBottomIcon },
  { dock: "right", label: "Dock right", Icon: DockRightIcon },
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
        className={`flex min-h-0 flex-col ${variant === "deck" ? "h-full" : ""} ${className ?? ""}`}
      >
        {variant !== "popover" && (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PANEL_DRAG_TYPE, id);
              e.dataTransfer.effectAllowed = "move";
              window.setTimeout(() => setDraggingPanel(id), 0);
            }}
            onDragEnd={() => setDraggingPanel(null)}
            title="Drag to move this panel to another dock"
            className="flex h-9 shrink-0 cursor-grab items-center gap-1.5 pl-1.5 pr-2 active:cursor-grabbing"
          >
            <GripIcon size={12} className="text-[#5C5B60]" />
            <button
              onClick={() => toggleCollapsed(id)}
              aria-expanded={!collapsed}
              className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-zk-muted hover:text-zk-text"
            >
              {title}
              <ChevronRightIcon size={13} className={`transition-transform ${collapsed ? "" : "rotate-90"}`} />
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
                    onClick={() => {
                      if (!current) movePanel(id, b.dock);
                    }}
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-[3px] transition-colors ${
                      current ? "bg-zk-selected text-zk-accent" : "text-zk-disabled hover:text-zk-text"
                    }`}
                  >
                    <b.Icon size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {variant === "side" ? (
          <Reveal open={!collapsed}>{children}</Reveal>
        ) : (
          !collapsed && <div className={`min-h-0 flex-1 ${variant === "deck" ? "overflow-y-auto" : ""}`}>{children}</div>
        )}
      </section>
    );
  },
);

export default PanelFrame;
