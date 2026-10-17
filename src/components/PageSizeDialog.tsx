import type React from "react";
import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@/components/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PageSizeForm from "@/components/PageSizeForm";
import { PAGE_PRESETS, type Page } from "@/utils/page";

interface PageSizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  onApply: (width: number, height: number) => void;
}

const PageSizeDialog: React.FC<PageSizeDialogProps> = ({ open, onOpenChange, page, onApply }) => {
  const [size, setSize] = useState({ width: page.width, height: page.height });
  const [view, setView] = useState<"size" | "presets">("size");

  useEffect(() => {
    if (!open) return;
    setSize({ width: page.width, height: page.height });
    setView("size");
  }, [open, page.width, page.height]);

  const apply = (width = size.width, height = size.height) => {
    onApply(width, height);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (view === "presets") {
            e.preventDefault();
            setView("size");
          }
        }}
        className="max-w-[460px] p-6"
      >
        {view === "size" ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <button
                onClick={() => setView("presets")}
                aria-label="Show page presets"
                className="flex h-8 w-8 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-raised"
              >
                <ArrowLeftIcon size={20} />
              </button>
              <DialogTitle className="text-[24px]">Page size</DialogTitle>
            </div>
            <DialogDescription className="mb-4 text-[12px] text-zk-muted">
              The page grows or shrinks around its centre. Nothing you drew moves; anything outside just dims.
            </DialogDescription>
            <PageSizeForm
              width={size.width}
              height={size.height}
              onChange={(width, height) => setSize({ width, height })}
              onSubmit={(width, height) => apply(width, height)}
            />
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setView("size")}
                aria-label="Back to page size"
                className="flex h-8 w-8 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-raised"
              >
                <ArrowLeftIcon size={20} />
              </button>
              <DialogTitle className="text-[24px]">Presets</DialogTitle>
            </div>
            <DialogDescription className="sr-only">Pick a preset page size.</DialogDescription>
            <div className="grid grid-cols-3 gap-2">
              {PAGE_PRESETS.map((p) => {
                const k = Math.min(48 / p.width, 48 / p.height);
                const selected = size.width === p.width && size.height === p.height;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSize({ width: p.width, height: p.height });
                      setView("size");
                    }}
                    aria-pressed={selected}
                    className={`group relative flex h-[104px] flex-col justify-between overflow-hidden rounded-[4px] p-2.5 text-left transition-colors ${
                      selected
                        ? "bg-[#2E2E34] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-zk-accent"
                        : "bg-zk-raised hover:bg-zk-hover"
                    }`}
                  >
                    <span className="flex flex-1 items-center justify-center">
                      <span className="block rounded-[2px] bg-[#ECEBE7]" style={{ width: p.width * k, height: p.height * k }} />
                    </span>
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="text-[13px] font-semibold text-zk-text group-aria-pressed:text-zk-accent">{p.label}</span>
                      <span className="text-[10px] text-zk-muted tabular-nums">
                        {p.width}×{p.height}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="h-9 rounded-[4px] px-3 text-[13px] text-zk-text-2 hover:bg-zk-raised">
            Cancel
          </button>
          <button
            onClick={() => apply()}
            className="h-9 rounded-[4px] bg-zk-accent px-4 text-[13px] font-semibold text-zk-on-accent hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PageSizeDialog;
