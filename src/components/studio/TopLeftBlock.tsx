import type React from "react";
import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useCanvasStore, useSettingsStore } from "@/hooks/useStores";
import { applyLayout, dockLayout } from "@/utils/dockLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopLeftBlockProps {
  drawingName: string;
  onNameChange: (name: string) => void;
  onNameCommit: (viaEnter: boolean) => void;
  saveStatus: "idle" | "saving" | "saved";
  onBack: () => void;
  onImport: () => void;
  onExport: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

const BACKGROUNDS = [
  { id: "white", label: "White" },
  { id: "transparent", label: "Transparent" },
  { id: "grid", label: "Grid" },
] as const;

const TOUCH_MODES = [
  { id: "auto", label: "Auto (pen and finger draw)" },
  { id: "stylus-only", label: "Stylus only (finger pans)" },
  { id: "touch-draw", label: "Finger draws" },
] as const;

const LAYOUTS = [
  { id: "bottom", label: "Bottom deck" },
  { id: "sidebars", label: "Sidebars" },
  { id: "minimal", label: "Minimal" },
] as const;

const Tick: React.FC<{ on: boolean }> = ({ on }) => (
  <span className="mr-2 inline-flex w-3 justify-center">
    {on && <Check className="h-3 w-3 text-zk-accent" />}
  </span>
);

const TopLeftBlock: React.FC<TopLeftBlockProps> = observer(
  ({ drawingName, onNameChange, onNameCommit, saveStatus, onBack, onImport, onExport, onClear, onOpenSettings }) => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();
    const inputRef = useRef<HTMLInputElement>(null);
    const enterCommitted = useRef(false);

    return (
      <div className="pointer-events-auto flex h-10 items-center gap-1 rounded-[6px] bg-zk-surface pr-2 pl-1.5 text-zk-text">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Drawing menu"
              className="flex h-8 items-center gap-1 rounded-[4px] pr-1 hover:bg-zk-hover"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-zk-accent font-display text-[16px] font-semibold text-zk-on-accent">
                Z
              </span>
              <ChevronDown className="h-3 w-3 text-zk-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem onClick={() => inputRef.current?.select()}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onBack}>Back to vault</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>Import image…</DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>Export…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Background</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {BACKGROUNDS.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => canvasStore.setBackground(b.id)}>
                    <Tick on={canvasStore.background === b.id} />
                    {b.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Touch &amp; stylus</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TOUCH_MODES.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => settingsStore.setTouchMode(t.id)}>
                    <Tick on={settingsStore.touchMode === t.id} />
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Layout</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {LAYOUTS.map((l) => (
                  <DropdownMenuItem key={l.id} onClick={() => applyLayout(l.id)}>
                    <Tick on={dockLayout.state.layout === l.id} />
                    {l.label}
                  </DropdownMenuItem>
                ))}
                {dockLayout.state.layout === "custom" && (
                  <DropdownMenuItem disabled>
                    <Tick on />
                    Custom
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear} className="text-red-400 focus:text-red-300">
              Clear canvas…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSettings}>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={inputRef}
          type="text"
          aria-label="Drawing name"
          value={drawingName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              enterCommitted.current = true;
              onNameCommit(true);
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            if (enterCommitted.current) {
              enterCommitted.current = false;
              return;
            }
            onNameCommit(false);
          }}
          className="w-44 rounded-[4px] bg-transparent px-1.5 py-1 text-[13px] font-medium outline-none focus:bg-zk-raised"
        />
        <span className="flex h-4 w-4 items-center justify-center" aria-live="polite">
          {saveStatus === "saving" && <Loader2 aria-label="Saving" className="h-3.5 w-3.5 animate-spin text-zk-muted" />}
          {saveStatus === "saved" && <Check aria-label="Saved" className="h-3.5 w-3.5 text-zk-muted" />}
        </span>
      </div>
    );
  },
);

export default TopLeftBlock;
