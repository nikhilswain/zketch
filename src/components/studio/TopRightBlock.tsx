import type React from "react";
import { observer } from "mobx-react-lite";
import { RedoIcon, TrashIcon, UndoIcon } from "@/components/icons";
import { useCanvasStore } from "@/hooks/useStores";

const TopRightBlock: React.FC<{ onShare: () => void; onClear: () => void }> = observer(({ onShare, onClear }) => {
  const canvasStore = useCanvasStore();
  const icon = "flex h-8 w-9 items-center justify-center rounded-[4px] text-zk-text hover:bg-zk-hover disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-[6px] bg-zk-surface shadow-(--zk-shadow-float) px-1">
      <button aria-label="Undo" title="Undo (Ctrl+Z)" onClick={() => canvasStore.undo()} disabled={!canvasStore.canUndo} className={icon}>
        <UndoIcon className="h-[17px] w-[17px]" />
      </button>
      <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => canvasStore.redo()} disabled={!canvasStore.canRedo} className={icon}>
        <RedoIcon className="h-[17px] w-[17px]" />
      </button>
      <button aria-label="Clear canvas" title="Clear canvas" onClick={onClear} disabled={canvasStore.isEmpty} className={icon}>
        <TrashIcon className="h-[17px] w-[17px]" />
      </button>
      <span className="mx-1 h-5 w-px bg-zk-divider" />
      <button
        onClick={onShare}
        className="h-8 rounded-[4px] bg-zk-accent px-3.5 text-[13px] font-semibold text-zk-on-accent hover:brightness-110"
      >
        Share
      </button>
    </div>
  );
});

export default TopRightBlock;
