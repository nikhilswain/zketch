import type React from "react";
import { useEffect, useRef, useState } from "react";
import { pickerBrushGroups } from "@/utils/brushCategories";
import type { BrushCategory, BrushStyle } from "@/engine/types";

interface BrushPickerProps {
  current: string | null;
  shortcuts: Record<string, string>;
  onSelect: (key: BrushStyle) => void;
  onClose: () => void;
}

type Tab = "all" | BrushCategory;

const BrushPicker: React.FC<BrushPickerProps> = ({
  current,
  shortcuts,
  onSelect,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("all");
  const groups = pickerBrushGroups();
  const visible = tab === "all" ? groups : groups.filter((g) => g.id === tab);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest("[data-brush-picker-toggle]")) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[440px] bg-white rounded-2xl shadow-[0_14px_44px_rgba(0,0,0,0.14)] overflow-hidden"
    >
      <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-gray-100">
        {[{ id: "all" as const, label: "All" }, ...groups].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-2.5 pb-3">
        {visible.map((group) => (
          <div key={group.id}>
            {tab === "all" && (
              <div className="px-1 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </div>
            )}
            <div className={`grid grid-cols-3 gap-1.5 ${tab === "all" ? "" : "pt-2.5"}`}>
              {group.brushes.map((b) => {
                const selected = current === b.key;
                return (
                  <button
                    key={b.key}
                    onClick={() => onSelect(b.key as BrushStyle)}
                    className={`relative rounded-xl px-2 pt-2 pb-2 text-left transition-colors ${
                      selected ? "bg-[#ececf0]" : "hover:bg-gray-50"
                    }`}
                  >
                    <img
                      src={`/brushes/previews/${b.key}.png`}
                      alt=""
                      draggable={false}
                      className="block w-full h-10 object-contain"
                    />
                    <span
                      className={`block mt-1 text-[11.5px] truncate ${
                        selected ? "font-semibold text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {b.label ?? b.key}
                    </span>
                    {shortcuts[b.key] && (
                      <span className="absolute top-1.5 right-2 text-[9px] text-gray-400">
                        {shortcuts[b.key]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BrushPicker;
