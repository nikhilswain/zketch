import type React from "react";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, PlusIcon } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PageSizeForm from "@/components/PageSizeForm";
import { PAGE_PRESETS, clampPageSide, type PagePresetId } from "@/utils/page";

type Choice = { kind: "infinite" } | { kind: "preset"; id: PagePresetId } | { kind: "custom" };

interface NewDrawingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (size: { width: number; height: number } | null) => void;
}

const STORAGE_KEY = "zketch-new-canvas";

const TILES: { id: PagePresetId | "infinite" | "custom"; col: string; row: string }[] = [
  { id: "infinite", col: "1 / span 2", row: "1 / span 7" },
  { id: "16x9", col: "1", row: "8 / span 5" },
  { id: "4x3", col: "2", row: "8 / span 5" },
  { id: "square", col: "3", row: "1 / span 4" },
  { id: "a4", col: "3", row: "5 / span 6" },
  { id: "custom", col: "3", row: "11 / span 2" },
  { id: "story", col: "4", row: "1 / span 7" },
  { id: "a4-wide", col: "4", row: "8 / span 5" },
];

function loadStored(): { choice: Choice; custom: { width: number; height: number } } {
  const fallback = { choice: { kind: "infinite" } as Choice, custom: { width: 2400, height: 1600 } };
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v || v === "infinite") return fallback;
    const m = v.match(/^custom:(\d+)x(\d+)$/);
    if (m) return { choice: { kind: "custom" }, custom: { width: clampPageSide(+m[1]), height: clampPageSide(+m[2]) } };
    if (PAGE_PRESETS.some((p) => p.id === v)) return { ...fallback, choice: { kind: "preset", id: v as PagePresetId } };
  } catch {
    return fallback;
  }
  return fallback;
}

function store(choice: Choice, custom: { width: number; height: number }) {
  try {
    const v =
      choice.kind === "infinite" ? "infinite" : choice.kind === "preset" ? choice.id : `custom:${custom.width}x${custom.height}`;
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    return;
  }
}

const PageShape: React.FC<{ width: number; height: number; max?: number }> = ({ width, height, max = 64 }) => {
  const k = Math.min(max / width, max / height);
  return <span className="block rounded-[2px] bg-[#ECEBE7]" style={{ width: width * k, height: height * k }} />;
};

const NewDrawingDialog: React.FC<NewDrawingDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const [choice, setChoice] = useState<Choice>({ kind: "infinite" });
  const [custom, setCustom] = useState({ width: 2400, height: 1600 });
  const [view, setView] = useState<"choices" | "custom">("choices");

  useEffect(() => {
    if (!open) return;
    const s = loadStored();
    setChoice(s.choice);
    setCustom(s.custom);
    setView("choices");
  }, [open]);

  const create = (c: Choice = choice, size = custom) => {
    store(c, size);
    if (c.kind === "infinite") return onCreate(null);
    if (c.kind === "custom") return onCreate(size);
    const p = PAGE_PRESETS.find((x) => x.id === c.id)!;
    onCreate({ width: p.width, height: p.height });
  };

  const isSelected = (id: string) =>
    (id === "infinite" && choice.kind === "infinite") ||
    (id === "custom" && choice.kind === "custom") ||
    (choice.kind === "preset" && choice.id === id);

  const tileClass = (id: string) =>
    `flex h-full min-h-0 flex-col justify-between rounded-[4px] p-2.5 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-zk-accent ${
      isSelected(id) ? "bg-zk-selected" : "bg-zk-raised hover:bg-zk-hover"
    }`;

  const select = (id: string) => {
    if (id === "infinite") setChoice({ kind: "infinite" });
    else if (id === "custom") {
      setChoice({ kind: "custom" });
      setView("custom");
    } else setChoice({ kind: "preset", id: id as PagePresetId });
  };

  const footer = (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={() => onOpenChange(false)} className="h-9 rounded-[4px] px-3 text-[13px] text-zk-text-2 hover:bg-zk-raised">
        Cancel
      </button>
      <button
        onClick={() => create()}
        className="h-9 rounded-[4px] bg-zk-accent px-4 text-[13px] font-semibold text-zk-on-accent hover:brightness-110"
      >
        Create
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (view === "custom") {
            e.preventDefault();
            setView("choices");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && view === "choices" && (e.target as HTMLElement).tagName !== "INPUT") {
            e.preventDefault();
            create();
          }
        }}
        className={view === "custom" ? "max-w-[460px] p-6" : "max-w-[640px] p-6"}
      >
        {view === "choices" ? (
          <>
            <DialogTitle className="text-[24px]">New drawing</DialogTitle>
            <DialogDescription className="mt-1 mb-4 text-[12px] text-zk-muted">
              Pick a canvas. Infinite or fixed can't be changed later; a page size can.
            </DialogDescription>
            <div
              className="grid justify-center gap-2"
              style={{ gridTemplateColumns: "repeat(4, 140px)", gridTemplateRows: "repeat(12, 26px)" }}
              role="radiogroup"
              aria-label="Canvas"
            >
              {TILES.map((t) => {
                const preset = PAGE_PRESETS.find((p) => p.id === t.id);
                const style = { gridColumn: t.col, gridRow: t.row };
                if (t.id === "infinite") {
                  return (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={isSelected(t.id)}
                      style={style}
                      onClick={() => select(t.id)}
                      onDoubleClick={() => create({ kind: "infinite" })}
                      className={tileClass(t.id)}
                    >
                      <span className="text-[13px] font-semibold text-zk-text">Infinite</span>
                      <span className="my-2 min-h-0 flex-1 rounded-[3px] bg-[radial-gradient(#3A3A40_1px,transparent_1px)] bg-[length:12px_12px]" />
                      <span className="text-[11px] text-zk-muted">Endless canvas, pan anywhere</span>
                    </button>
                  );
                }
                if (t.id === "custom") {
                  return (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={isSelected(t.id)}
                      style={style}
                      onClick={() => select(t.id)}
                      className={`${tileClass(t.id)} !flex-row items-center gap-2`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-dashed border-[#4A4A50] text-zk-text-2">
                        <PlusIcon size={14} />
                      </span>
                      <span className="flex flex-1 items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-zk-text">Custom</span>
                        <span className="text-[11px] text-zk-muted">W × H</span>
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={isSelected(t.id)}
                    style={style}
                    onClick={() => select(t.id)}
                    onDoubleClick={() => create({ kind: "preset", id: t.id as PagePresetId })}
                    className={tileClass(t.id)}
                  >
                    <span className="flex min-h-0 flex-1 items-center justify-center">
                      <PageShape width={preset!.width} height={preset!.height} />
                    </span>
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="text-[13px] font-semibold text-zk-text">{preset!.label}</span>
                      <span className="text-[11px] text-zk-muted tabular-nums">
                        {preset!.width === preset!.height ? `${preset!.width}²` : `${preset!.width}×${preset!.height}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {footer}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setView("choices")}
                aria-label="Back to canvas choices"
                className="flex h-8 w-8 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-raised"
              >
                <ArrowLeftIcon size={20} />
              </button>
              <DialogTitle className="text-[24px]">Custom size</DialogTitle>
            </div>
            <DialogDescription className="sr-only">Set the page width and height in pixels.</DialogDescription>
            <PageSizeForm
              width={custom.width}
              height={custom.height}
              onChange={(width, height) => setCustom({ width, height })}
              onSubmit={(width, height) => create({ kind: "custom" }, { width, height })}
            />
            {footer}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewDrawingDialog;
