import { isStrokeElement } from "@/engine/types";
import ZketchMark from "@/components/ZketchMark";
import type React from "react";
import { useState, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore, useVaultStore } from "../hooks/useStores";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import {
  CloseIcon,
  DownloadIcon,
  LayoutGridIcon,
  MasonryIcon,
  ListIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import { DexieService } from "@/services/DexieService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { exportDrawings, importBackupFile, keepStorage } from "@/services/VaultBackup";
import { BACKUP_EXTENSION } from "@/services/BackupService";
import type { ISavedDrawing } from "@/models/VaultModel";
import SettingsPage from "./studio/SettingsPage";
import { toast } from "sonner";
import { SURROUND, resolveSurround } from "@/utils/page";
import { themeState } from "@/utils/theme";
import MasonryColumns from "./MasonryColumns";
import SharedLinks from "./share/SharedLinks";
import { formatDate } from "@/utils/date";
import * as deletes from "@/utils/pendingDelete";

type SortOrder = "updated" | "created" | "name";

interface VaultViewProps {
  onNewDrawing: () => void;
  onEditDrawing: (drawingId: string) => void;
}

const SORTS: { id: SortOrder; label: string }[] = [
  { id: "updated", label: "Recent" },
  { id: "created", label: "Created" },
  { id: "name", label: "Name" },
];

const BACKGROUND_LABEL: Record<string, string> = { white: "White", transparent: "Transparent", grid: "Grid" };

const ThumbnailImage: React.FC<{ thumbnailId: string; alt: string; className?: string }> = ({
  thumbnailId,
  alt,
  className,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadThumbnail = async () => {
      if (!thumbnailId) {
        setLoading(false);
        return;
      }
      if (BlobStorageService.isThumbnailId(thumbnailId)) {
        const dataUrl = await BlobStorageService.getThumbnailDataUrl(thumbnailId);
        if (mounted && dataUrl) setSrc(dataUrl);
      } else if (mounted) {
        setSrc(thumbnailId);
      }
      if (mounted) setLoading(false);
    };
    loadThumbnail();
    return () => {
      mounted = false;
    };
  }, [thumbnailId]);

  if (loading) return <div className={`${className} animate-pulse bg-[#efeee9]`} />;
  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <span className="font-display text-[13px] text-[#b5b2aa]">Empty</span>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} loading="lazy" />;
};

function countStrokes(drawing: ISavedDrawing) {
  return drawing.layers.reduce((total, layer: any) => {
    if (layer.type === "draw" && Array.isArray(layer.elements)) {
      return total + layer.elements.filter((e: any) => isStrokeElement(e)).length;
    }
    if (layer.type === "stroke" && layer.strokes) return total + layer.strokes.length;
    return total;
  }, 0);
}

function countColors(drawing: ISavedDrawing) {
  const colors = new Set<string>();
  drawing.layers.forEach((layer: any) => {
    if (layer.type === "draw" && Array.isArray(layer.elements)) {
      layer.elements.forEach((e: any) => {
        if (isStrokeElement(e)) colors.add(e.color);
      });
    } else if (layer.type === "stroke" && layer.strokes) {
      layer.strokes.forEach((stroke: any) => colors.add(stroke.color));
    }
  });
  return colors.size;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

type ViewMode = "grid" | "masonry" | "list";
type VaultTab = "drawings" | "shared";

const TABS: { id: VaultTab; label: string }[] = [
  { id: "drawings", label: "Your drawings" },
  { id: "shared", label: "Shared" },
];

function initialTab(): VaultTab {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "shared" || fromUrl === "drawings") {
      localStorage.setItem("zketch-vault-tab", fromUrl);
      return fromUrl;
    }
    return localStorage.getItem("zketch-vault-tab") === "shared" ? "shared" : "drawings";
  } catch {
    return "drawings";
  }
}
const CHECKER_BG = "bg-[repeating-conic-gradient(#efefef_0%_25%,#ffffff_0%_50%)] bg-[length:14px_14px]";

const VaultView: React.FC<VaultViewProps> = observer(({ onNewDrawing, onEditDrawing }) => {
  const vaultStore = useVaultStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem("zketch-vault-view");
      return v === "list" || v === "masonry" ? v : "grid";
    } catch {
      return "grid";
    }
  });
  const [tab, setTab] = useState<VaultTab>(initialTab);
  const settingsStore = useSettingsStore();
  const surround = SURROUND[resolveSurround(settingsStore.surroundMode, themeState.resolved)];
  const [sortBy, setSortBy] = useState<SortOrder>("updated");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ISavedDrawing | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const importFiles = async (files: File[]) => {
    await deletes.flushAll();
    let added = 0;
    let skipped = 0;
    for (const f of files) {
      try {
        const r = await importBackupFile(f);
        added += r.added.length;
        skipped += r.skipped;
      } catch (e) {
        toast.error(`Couldn't import “${f.name}”`, { description: e instanceof Error ? e.message : undefined });
      }
    }
    if (added > 0) {
      await vaultStore.loadFromDB();
      await vaultStore.updateStorageInfo();
      keepStorage();
      toast.success(`Imported ${plural(added, "drawing")}`, {
        description: skipped > 0 ? `${plural(skipped, "drawing")} already here, left as is` : undefined,
      });
    } else if (skipped > 0) {
      toast(`${skipped === 1 ? "That drawing is" : "Those drawings are"} already here`);
    }
  };

  const saveFile = async (ids?: string[]) => {
    await deletes.flushAll();
    try {
      const n = await exportDrawings(ids);
      if (!ids && n > 0) toast.success(`Backed up ${plural(n, "drawing")}`, { description: "Keep the file somewhere safe. Import it here to restore." });
    } catch (e) {
      console.error("Backup failed:", e);
      toast.error("Couldn't save the file");
    }
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const thumbBox = (drawing: ISavedDrawing, natural: boolean) => {
    const checker = drawing.background === "transparent";
    const page = drawing.page;
    if (page && natural) {
      return (
        <div
          className={`w-full overflow-hidden rounded-[4px] shadow-(--zk-mini-edge) ${checker ? CHECKER_BG : "bg-white"}`}
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        >
          <ThumbnailImage thumbnailId={drawing.thumbnail} alt={drawing.name} className="h-full w-full object-cover" />
        </div>
      );
    }
    if (page) {
      return (
        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[4px] p-2 shadow-(--zk-mini-edge)" style={{ backgroundColor: surround }}>
          <ThumbnailImage
            thumbnailId={drawing.thumbnail}
            alt={drawing.name}
            className={`max-h-full max-w-full shadow-[0_2px_8px_rgba(0,0,0,0.18)] ${checker ? CHECKER_BG : ""}`}
          />
        </div>
      );
    }
    return (
      <div className={`aspect-[4/3] w-full overflow-hidden rounded-[4px] shadow-(--zk-mini-edge) ${checker ? CHECKER_BG : "bg-white"}`}>
        <ThumbnailImage thumbnailId={drawing.thumbnail} alt={drawing.name} className="h-full w-full object-cover" />
      </div>
    );
  };

  const newTile = (
    <button
      onClick={onNewDrawing}
      className="group flex h-full w-full flex-col rounded-[6px] p-2 text-left transition-colors hover:bg-zk-raised"
    >
      <span className="flex aspect-[4/3] w-full items-center justify-center rounded-[4px] border border-dashed border-zk-divider text-zk-muted transition-colors group-hover:border-zk-accent group-hover:text-zk-accent">
        <PlusIcon className="h-7 w-7" />
      </span>
      <span className="px-1 pt-3 font-display text-[16px] font-semibold text-zk-text-2 group-hover:text-zk-text">
        New drawing
      </span>
    </button>
  );

  const card = (drawing: ISavedDrawing, natural: boolean) => (
    <div
      role="link"
      tabIndex={0}
      onClick={() => open(drawing)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && editingId !== drawing.id) onEditDrawing(drawing.id);
        if (e.key === "F2") startRename(drawing);
      }}
      className="group flex cursor-pointer flex-col rounded-[6px] p-2 transition-colors outline-none hover:bg-zk-raised focus-visible:bg-zk-raised"
    >
      {thumbBox(drawing, natural)}
      <div className="flex items-start gap-2 px-1 pt-3">
        <div className="min-w-0 flex-1">
          {nameField(drawing, "text-[16px]")}
          <p className="mt-0.5 truncate text-[12px] text-zk-muted">
            Edited {formatDate(drawing.updatedAt)} · {plural(countStrokes(drawing), "stroke")}
          </p>
        </div>
        {actions(drawing)}
      </div>
    </div>
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tab")) return;
    url.searchParams.delete("tab");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const chooseTab = (next: VaultTab) => {
    setTab(next);
    try {
      localStorage.setItem("zketch-vault-tab", next);
    } catch {
      return;
    }
  };

  const chooseView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("zketch-vault-view", mode);
    } catch {
      return;
    }
  };

  useEffect(() => {
    const flush = () => void deletes.flushAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const unhide = (id: string) =>
    setDeleting((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    setPendingDelete(null);
    setDeleting((current) => new Set(current).add(id));
    const toastId = toast(`Deleted “${name}”`, {
      duration: Infinity,
      action: {
        label: "Undo",
        onClick: () => {
          if (deletes.undo(id)) unhide(id);
        },
      },
      onDismiss: () => void deletes.flush(id),
    });
    deletes.schedule(
      id,
      async () => {
        toast.dismiss(toastId);
        await vaultStore.deleteDrawing(id);
        unhide(id);
      },
      6000,
    );
  };

  const commitRename = async (drawingId: string) => {
    const name = newName.trim();
    const current = vaultStore.drawings.find((d: ISavedDrawing) => d.id === drawingId)?.name;
    if (name && name !== current) await vaultStore.renameDrawing(drawingId, name);
    setEditingId(null);
    setNewName("");
  };

  const startRename = (drawing: ISavedDrawing) => {
    setEditingId(drawing.id);
    setNewName(drawing.name);
  };

  const query = searchQuery.trim().toLowerCase();
  const visible: ISavedDrawing[] = vaultStore.drawings.filter((d: ISavedDrawing) => !deleting.has(d.id));
  const isEmpty = visible.length === 0;
  const drawings: ISavedDrawing[] = vaultStore.sortedDrawings
    .filter((d: ISavedDrawing) => !deleting.has(d.id) && d.name.toLowerCase().includes(query))
    .sort((a: ISavedDrawing, b: ISavedDrawing) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "created") return b.createdAt.getTime() - a.createdAt.getTime();
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const count = visible.length;

  const nameField = (drawing: ISavedDrawing, className: string) =>
    editingId === drawing.id ? (
      <input
        value={newName}
        ref={(el) => {
          if (el && document.activeElement !== el) requestAnimationFrame(() => el.focus());
        }}
        aria-label="Drawing name"
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setNewName(e.target.value)}
        onBlur={() => commitRename(drawing.id)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commitRename(drawing.id);
          if (e.key === "Escape") {
            setEditingId(null);
            setNewName("");
          }
        }}
        className="h-7 w-full min-w-0 rounded-[3px] bg-zk-raised px-1.5 font-display text-[15px] font-semibold text-zk-text outline-none focus-visible:outline-1 focus-visible:outline-zk-accent"
      />
    ) : (
      <h3 className={`truncate font-display font-semibold text-zk-text ${className}`}>{drawing.name}</h3>
    );

  const actions = (drawing: ISavedDrawing) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Actions for ${drawing.name}`}
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-zk-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zk-hover hover:text-zk-text focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onClick={() => onEditDrawing(drawing.id)}>Open</DropdownMenuItem>
        <DropdownMenuItem onClick={() => startRename(drawing)}>
          <PencilIcon className="h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => saveFile([drawing.id])}>
          <DownloadIcon className="h-4 w-4" />
          Save as file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setPendingDelete(drawing)} className="text-(--zk-danger) focus:text-(--zk-danger)">
          <TrashIcon className="h-4 w-4" />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const open = (drawing: ISavedDrawing) => {
    if (editingId !== drawing.id) onEditDrawing(drawing.id);
  };

  return (
    <div
      className="relative min-h-screen bg-zk-surface font-ui text-zk-text"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current++;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept={`${BACKUP_EXTENSION},application/json`}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) importFiles(files);
        }}
      />
      {dropping && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-[10px] border-2 border-dashed border-zk-accent bg-zk-surface/85 backdrop-blur-sm">
          <p className="font-display text-[24px] font-semibold">Drop a {BACKUP_EXTENSION} file to import it</p>
        </div>
      )}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-zk-hairline bg-zk-surface/95 px-6 backdrop-blur sm:px-10">
        <div className="zk-logo-hover flex items-center gap-2.5">
          <ZketchMark size={32} />
          <span className="font-display text-[20px] font-semibold">Zketch</span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Backup and import"
                title="Backup and import"
                className="flex h-9 w-9 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-raised hover:text-zk-text data-[state=open]:bg-zk-raised"
              >
                <DownloadIcon className="h-[18px] w-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem disabled={isEmpty} onClick={() => saveFile()}>
                <DownloadIcon className="h-4 w-4" />
                Back up all drawings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                <UploadIcon className="h-4 w-4" />
                Import {BACKUP_EXTENSION} file…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-[4px] text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
          >
            <SettingsIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={onNewDrawing}
            className="flex h-9 items-center gap-2 rounded-[4px] bg-zk-accent px-4 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
          >
            <PlusIcon className="h-4 w-4" />
            New drawing
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 pt-10 pb-16 sm:px-10">
        <div className="mb-6 flex h-9 w-fit items-center gap-0.5 rounded-[4px] bg-zk-raised/60 p-0.5" role="tablist" aria-label="Vault">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => chooseTab(t.id)}
              className={`h-8 rounded-[3px] px-3 text-[13px] transition-colors ${
                tab === t.id ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="font-display text-[40px] leading-none font-semibold">{tab === "shared" ? "Shared links" : "Your drawings"}</h1>
            <p className="mt-3 text-[13px] text-zk-muted">
              {tab === "shared"
                ? "Links you've made in this browser. Changes to a link can take a minute or two to reach everyone."
                : vaultStore.isLoading
                ? "Loading…"
                : `${count} drawing${count === 1 ? "" : "s"}${
                    vaultStore.storageInfo.quota > 0
                      ? ` · ${DexieService.formatBytes(vaultStore.storageInfo.used)} stored on this device`
                      : ""
                  }`}
            </p>
          </div>

          {tab === "drawings" && !isEmpty && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zk-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search drawings"
                  className="h-9 w-56 rounded-[4px] bg-zk-raised pr-8 pl-8 text-[13px] text-zk-text placeholder:text-zk-disabled outline-none focus-visible:outline-1 focus-visible:outline-zk-accent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[3px] text-zk-muted hover:text-zk-text"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex h-9 items-center gap-0.5 rounded-[4px] bg-zk-raised/60 p-0.5" role="radiogroup" aria-label="Sort by">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={sortBy === s.id}
                    onClick={() => setSortBy(s.id)}
                    className={`h-8 rounded-[3px] px-3 text-[13px] transition-colors ${
                      sortBy === s.id ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex h-9 items-center gap-0.5 rounded-[4px] bg-zk-raised/60 p-0.5" role="radiogroup" aria-label="View">
                {([
                  { id: "grid", label: "Grid", icon: LayoutGridIcon },
                  { id: "masonry", label: "Masonry", icon: MasonryIcon },
                  { id: "list", label: "List", icon: ListIcon },
                ] as const).map((v) => (
                  <button
                    key={v.id}
                    role="radio"
                    aria-checked={viewMode === v.id}
                    aria-label={v.label}
                    onClick={() => chooseView(v.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-[3px] transition-colors ${
                      viewMode === v.id ? "bg-zk-selected text-zk-text" : "text-zk-muted hover:text-zk-text"
                    }`}
                  >
                    <v.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {tab === "shared" ? (
          <SharedLinks onOpenDrawing={onEditDrawing} />
        ) : vaultStore.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-7">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-[6px] bg-zk-raised" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center py-24 text-center">
            <button
              onClick={onNewDrawing}
              className="mb-8 flex aspect-[4/3] w-64 items-center justify-center rounded-[6px] bg-[#FBFAF6] text-[#b5b2aa] shadow-(--zk-mini-edge) transition-transform hover:-translate-y-0.5"
              aria-label="Start your first drawing"
            >
              <PlusIcon className="h-10 w-10" />
            </button>
            <h2 className="font-display text-[28px] font-semibold">Nothing here yet</h2>
            <p className="mt-2 max-w-sm text-[14px] text-zk-muted">
              Start a drawing and it saves itself here as you work. Everything stays on this device.
            </p>
            <button
              onClick={onNewDrawing}
              className="mt-6 flex h-10 items-center gap-2 rounded-[4px] bg-zk-accent px-5 text-[14px] font-semibold text-zk-on-accent hover:brightness-110"
            >
              <PlusIcon className="h-4 w-4" />
              Start drawing
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              className="mt-3 text-[13px] text-zk-text-2 underline-offset-4 hover:underline"
            >
              or import a {BACKUP_EXTENSION} file
            </button>
          </div>
        ) : drawings.length === 0 ? (
          <div className="py-24 text-center">
            <h2 className="font-display text-[24px] font-semibold">No drawings match “{searchQuery.trim()}”</h2>
            <button onClick={() => setSearchQuery("")} className="mt-3 text-[13px] text-zk-text-2 underline-offset-4 hover:underline">
              Clear search
            </button>
          </div>
        ) : viewMode === "masonry" ? (
          <MasonryColumns
            items={[
              ...(!query ? [{ key: "new", aspect: 4 / 3, node: newTile }] : []),
              ...drawings.map((drawing) => ({
                key: drawing.id,
                aspect: drawing.page ? drawing.page.width / drawing.page.height : 4 / 3,
                node: card(drawing, true),
              })),
            ]}
          />
        ) : viewMode === "grid" ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-3 gap-y-3">
            {!query && <li>{newTile}</li>}
            {drawings.map((drawing) => (
              <li key={drawing.id}>{card(drawing, false)}</li>
            ))}
          </ul>
        ) : (
          <div role="table" aria-label="Drawings" className="flex flex-col">
            <div role="row" className="grid grid-cols-[64px_1fr_120px_120px_80px_80px_100px_32px] items-center gap-4 border-b border-zk-hairline px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-zk-muted uppercase">
              <span role="columnheader" />
              <span role="columnheader">Name</span>
              <span role="columnheader">Edited</span>
              <span role="columnheader">Created</span>
              <span role="columnheader">Strokes</span>
              <span role="columnheader">Colours</span>
              <span role="columnheader">Background</span>
              <span role="columnheader" />
            </div>
            {drawings.map((drawing) => (
              <div
                key={drawing.id}
                role="row"
                tabIndex={0}
                onClick={() => open(drawing)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editingId !== drawing.id) onEditDrawing(drawing.id);
                  if (e.key === "F2") startRename(drawing);
                }}
                className="group grid cursor-pointer grid-cols-[64px_1fr_120px_120px_80px_80px_100px_32px] items-center gap-4 rounded-[4px] px-3 py-2 text-[13px] text-zk-text-2 outline-none hover:bg-zk-raised focus-visible:bg-zk-raised"
              >
                <div
                  role="cell"
                  className={`flex h-12 w-16 items-center justify-center overflow-hidden rounded-[3px] shadow-(--zk-mini-edge) ${drawing.page ? "" : "bg-white"}`}
                  style={drawing.page ? { backgroundColor: surround } : undefined}
                >
                  <ThumbnailImage
                    thumbnailId={drawing.thumbnail}
                    alt=""
                    className={drawing.page ? "max-h-full max-w-full" : "h-full w-full object-cover"}
                  />
                </div>
                <div role="cell" className="min-w-0">{nameField(drawing, "text-[15px]")}</div>
                <span role="cell">{formatDate(drawing.updatedAt)}</span>
                <span role="cell">{formatDate(drawing.createdAt)}</span>
                <span role="cell" className="tabular-nums">{countStrokes(drawing)}</span>
                <span role="cell" className="tabular-nums">{countColors(drawing)}</span>
                <span role="cell">{BACKGROUND_LABEL[drawing.background] ?? drawing.background}</span>
                <div role="cell">{actions(drawing)}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-[400px] gap-5">
          <div>
            <DialogTitle className="text-[24px]">Delete drawing?</DialogTitle>
            <DialogDescription className="mt-2 text-[13px] leading-relaxed text-zk-muted">
              “{pendingDelete?.name}” and all its layers will be removed from this device. You can undo it for a few seconds afterwards.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingDelete(null)}
              className="h-9 rounded-[4px] px-4 text-[13px] font-medium text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="h-9 rounded-[4px] bg-[#e5484d] px-4 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
    </div>
  );
});

export default VaultView;
