import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { SearchIcon } from "@/components/icons";
import { useCanvasStore } from "@/hooks/useStores";
import { pickerBrushGroups } from "@/utils/brushCategories";
import { selectBrush } from "@/utils/brushMemory";
import type { BrushCategory, BrushStyle } from "@/engine/types";
import PanelFrame, { usePanelVariant } from "../PanelFrame";

type Tab = "all" | BrushCategory;

export const BrushLibrary: React.FC<{ onPicked?: () => void }> = observer(({ onPicked }) => {
  const canvasStore = useCanvasStore();
  const variant = usePanelVariant();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const groups = pickerBrushGroups();
  const q = query.trim().toLowerCase();
  const visible = groups
    .filter((g) => tab === "all" || g.id === tab)
    .map((g) => ({
      ...g,
      brushes: g.brushes.filter((b) => !q || (b.label ?? b.key).toLowerCase().includes(q)),
    }))
    .filter((g) => g.brushes.length > 0);
  const current =
    canvasStore.activeTool === "brush" ? canvasStore.currentBrushStyle : null;
  const wide = variant === "deck";

  const search = (
    <label className="flex h-7 items-center gap-1.5 rounded-[4px] bg-zk-raised px-2 text-zk-muted">
      <SearchIcon size={12} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        aria-label="Search brushes"
        className="w-full bg-transparent text-[12px] text-zk-text outline-none placeholder:text-zk-muted"
      />
    </label>
  );

  const tabs = [{ id: "all" as const, label: "All" }, ...groups.map((g) => ({ id: g.id, label: g.label }))];

  const grid = (
    <div className={`min-h-0 flex-1 overflow-y-auto ${wide ? "px-3 pb-3" : "px-2 pb-3"}`}>
      {visible.map((group) => (
        <div key={group.id}>
          {tab === "all" && (
            <div className="px-1 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zk-muted">
              {group.label}
            </div>
          )}
          <div className={`grid gap-1 ${wide ? "grid-cols-4" : "grid-cols-3"} ${tab === "all" ? "" : "pt-2"}`}>
            {group.brushes.map((b) => {
              const selected = current === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => {
                    selectBrush(canvasStore, b.key as BrushStyle);
                    onPicked?.();
                  }}
                  aria-pressed={selected}
                  className={`flex flex-col gap-1 rounded-[4px] px-2 pt-1.5 pb-2 text-left transition-colors ${
                    selected ? "bg-zk-selected" : "hover:bg-zk-raised"
                  }`}
                >
                  <img
                    src={`/brushes/previews/${b.key}.png`}
                    alt=""
                    draggable={false}
                    className="block h-9 w-full object-contain"
                    style={{ filter: "var(--zk-preview-filter)" }}
                  />
                  <span
                    className={`truncate text-[11.5px] ${
                      selected ? "font-semibold text-zk-text" : "text-zk-text-2"
                    }`}
                  >
                    {b.label ?? b.key}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <p className="px-1 pt-3 text-[12px] text-zk-muted">No brush matches “{query}”.</p>
      )}
    </div>
  );

  if (wide) {
    return (
      <div className="flex h-full min-h-0">
        <nav aria-label="Brush categories" className="flex w-36 shrink-0 flex-col gap-px border-r border-zk-hairline px-2.5 pb-3">
          <div className="pb-1.5">{search}</div>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`h-7 rounded-[4px] px-2 text-left text-[13px] ${
                tab === t.id ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {grid}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-2 pb-1">
        {search}
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`h-6 rounded-[4px] px-2 text-[12px] ${
                tab === t.id ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {grid}
    </div>
  );
});

const BrushesPanel: React.FC = () => (
  <PanelFrame id="brushes" title="Brushes">
    <BrushLibrary />
  </PanelFrame>
);

export default BrushesPanel;
