import type React from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
  LoaderIcon,
  ShareIcon,
} from "@/components/icons";
import { toast } from "sonner";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import StrokeTrack from "./studio/StrokeTrack";
import type { ExportFormat } from "@/models/SettingsModel";
import type { IStroke, BackgroundType } from "@/models/CanvasModel";
import { ExportService, type IExportLayer } from "@/services/ExportService";
import { createShareLink, listShares, unshareLink, type SharedLink } from "@/share/shareClient";
import { serializeLayers } from "@/utils/serializeLayers";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { effectiveExportScale, exportScaleCap, type Page } from "@/utils/page";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  strokes: IStroke[];
  background: BackgroundType;
  drawingName: string;
  layerCount?: number;
  onFlattenLayers?: () => void;
  layers?: IExportLayer[];
  page?: Page | null;
  focusedLayerName?: string | null;
  drawingId?: string | null;
}

const EXPORT_W = 1920;
const EXPORT_H = 1080;

const FORMATS: { id: "png" | "jpg"; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Lossless, keeps transparency" },
  { id: "jpg", label: "JPG", hint: "Smaller file, solid background" },
];

const CHECKER = "repeating-conic-gradient(#e6e6e6 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px";

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zk-muted">{children}</h3>
);

const ExportDialog: React.FC<ExportDialogProps> = observer(
  ({ isOpen, onClose, onExport, strokes, background, drawingName, layerCount = 1, onFlattenLayers, layers, page = null, focusedLayerName = null, drawingId = null }) => {
    const settingsStore = useSettingsStore();
    const canvasStore = useCanvasStore();
    const { scale, quality, transparentBackground } = settingsStore.exportSettings;
    const format: "png" | "jpg" = settingsStore.exportSettings.format === "jpg" ? "jpg" : "png";
    const canvasTransparent = background === "transparent";
    const transparent = format === "png" && (transparentBackground || canvasTransparent);

    const [preview, setPreview] = useState("");
    const [rendering, setRendering] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [allowContinue, setAllowContinue] = useState(false);
    const [links, setLinks] = useState<SharedLink[]>([]);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const hasContent =
      strokes.length > 0 ||
      !!layers?.some(
        (l) => l.visible && (l.type === "image" || (l.type === "draw" && (l.elements?.length ?? 0) > 0)),
      );

    useEffect(() => {
      if (isOpen) {
        setShareUrl(null);
        setCopied(false);
        setLinks(listShares(drawingId));
      }
    }, [isOpen, drawingId]);

    useEffect(() => {
      if (!isOpen || !hasContent) return;
      let cancelled = false;
      setRendering(true);
      const render = page
        ? ExportService.exportPage(
            layers ?? [],
            page,
            Math.min(1, 1280 / Math.max(page.width, page.height)),
            format === "jpg" && canvasTransparent ? "white" : background,
            "png",
            { transparentBackground: format === "png" && transparentBackground, quality: 1 },
          )
        : ExportService.exportToPNG(
            strokes,
            format === "jpg" && canvasTransparent ? "white" : background,
            1280,
            720,
            { ...settingsStore.exportSettings, scale: 1, transparentBackground: format === "png" && transparentBackground },
            layers,
          );
      render
        .then((url) => {
          if (!cancelled) setPreview(url);
        })
        .catch((error) => console.error("Failed to generate preview:", error))
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
      return () => {
        cancelled = true;
      };
    }, [isOpen, format, transparentBackground]);

    const download = () => {
      if (!hasContent) return;
      onExport(format);
      onClose();
    };

    const copy = async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        toast.error("Couldn't copy the link. Select it and copy manually.");
      }
    };

    const createLink = async () => {
      if (sharing || !hasContent) return;
      setSharing(true);
      try {
        const now = new Date();
        const drawing: ISavedDrawingData = {
          id: drawingId ?? "",
          name: drawingName,
          layers: serializeLayers(canvasStore.layers) as ISavedDrawingData["layers"],
          activeLayerId: canvasStore.activeLayerId,
          thumbnail: "",
          createdAt: now,
          updatedAt: now,
          background: canvasStore.background,
          ...(canvasStore.page ? { page: { ...canvasStore.page } } : {}),
        };
        const { link, reused } = await createShareLink({ drawing, allowContinue, drawingId });
        setShareUrl(link.url);
        setLinks(listShares(drawingId));
        void copy(link.url);
        if (reused) toast("Nothing changed since your last link, so here it is again.");
      } catch (error) {
        console.error("Failed to share:", error);
        const message = error instanceof Error ? error.message : "";
        if (message === "too large") {
          toast.error("This drawing is too big to share (over 10 MB). Save it as a file instead.");
        } else if (message === "rate limited") {
          toast.error("You've shared a lot this hour. Try again later.");
        } else {
          toast.error(message || "Failed to create share link. Please try again.");
        }
      } finally {
        setSharing(false);
      }
    };

    const unshare = async (link: SharedLink) => {
      if (removingId) return;
      setRemovingId(link.id);
      try {
        await unshareLink(link);
        setLinks(listShares(drawingId));
        if (shareUrl === link.url) setShareUrl(null);
      } catch (error) {
        console.error("Failed to unshare:", error);
        toast.error("Couldn't unshare that link. Please try again.");
      } finally {
        setRemovingId(null);
      }
    };

    const nativeShare = async () => {
      if (!shareUrl || !navigator.share) return;
      try {
        await navigator.share({ title: drawingName, text: "A drawing made with Zketch", url: shareUrl });
      } catch {
        return;
      }
    };

    const scaleCap = page ? Math.max(0.5, Math.floor(exportScaleCap(page.width, page.height) * 4) / 4) : 4;
    const shownScale = page ? Math.min(scale, scaleCap) : scale;
    const realScale = effectiveExportScale(scale, page);
    const outW = Math.round((page ? page.width : EXPORT_W) * realScale);
    const outH = Math.round((page ? page.height : EXPORT_H) * realScale);

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className="flex max-h-[calc(100dvh-32px)] min-h-[min(560px,calc(100dvh-32px))] max-w-[960px] gap-0 overflow-hidden p-0"
        >
          <div className="relative hidden min-w-0 flex-1 flex-col bg-(--zk-well) md:flex">
            <div className="flex min-h-0 flex-1 items-center justify-center p-8">
              {hasContent ? (
                preview ? (
                  <img
                    src={preview}
                    alt={`Preview of ${drawingName}`}
                    className={`max-h-full max-w-full rounded-[3px] shadow-(--zk-shadow-stage) transition-opacity duration-150 ${rendering ? "opacity-60" : ""}`}
                    style={transparent ? { background: CHECKER } : undefined}
                  />
                ) : (
                  <LoaderIcon className="h-6 w-6 animate-spin text-zk-muted" />
                )
              ) : (
                <p className="max-w-[240px] text-center text-[13px] text-zk-muted">
                  Nothing to export yet. Draw something first.
                </p>
              )}
            </div>
            <div className="flex h-10 shrink-0 items-center justify-between px-5 text-[12px] text-zk-muted">
              <span>
                {focusedLayerName ? `Only ${focusedLayerName} (focus mode)` : layerCount > 1 ? "All visible layers, combined" : "Preview"}
              </span>
              <span className="tabular-nums">
                {outW} × {outH} px
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col md:w-[340px]">
            <div className="px-6 pt-6 pb-4">
              <DialogTitle className="text-[26px]">Export</DialogTitle>
              <DialogDescription className="mt-1 truncate text-[13px] text-zk-muted">{drawingName}</DialogDescription>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
              <div>
                <SectionLabel>Format</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Format">
                  {FORMATS.map((f) => {
                    const selected = format === f.id;
                    return (
                      <button
                        key={f.id}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => settingsStore.setExportSettings({ format: f.id })}
                        className={`flex flex-col items-start gap-0.5 rounded-[4px] px-3 py-2.5 text-left transition-colors ${
                          selected ? "bg-zk-selected" : "bg-zk-raised/50 hover:bg-zk-raised"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-zk-text">
                          {f.label}
                          {selected && <CheckIcon className="h-3.5 w-3.5 text-zk-accent" />}
                        </span>
                        <span className="text-[11px] leading-snug text-zk-muted">{f.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <StrokeTrack
                  compact
                  kind="flat"
                  label="Scale"
                  value={shownScale}
                  display={`${Math.round(realScale * 100) / 100}×`}
                  min={0.5}
                  max={scaleCap}
                  step={page ? 0.25 : 0.5}
                  onChange={(v) => settingsStore.setExportSettings({ scale: v })}
                />
                {format === "jpg" ? (
                  <StrokeTrack
                    compact
                    kind="flat"
                    label="Quality"
                    value={Math.round(quality * 100)}
                    display={`${Math.round(quality * 100)}%`}
                    min={10}
                    max={100}
                    step={5}
                    onChange={(v) => settingsStore.setExportSettings({ quality: v / 100 })}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3 text-[13px] text-zk-text-2">
                    <span>
                      Transparent background
                      {canvasTransparent && <span className="block text-[11px] text-zk-muted">The canvas is already transparent</span>}
                    </span>
                    <button
                      role="switch"
                      aria-checked={transparent}
                      aria-label="Transparent background"
                      disabled={canvasTransparent}
                      onClick={() => settingsStore.setExportSettings({ transparentBackground: !transparentBackground })}
                      className={`relative h-[18px] w-8 shrink-0 rounded-[3px] transition-colors disabled:opacity-50 ${transparent ? "bg-zk-accent" : "bg-zk-hover"}`}
                    >
                      <span
                        className={`absolute top-[2px] h-[14px] w-[14px] rounded-[2px] bg-(--zk-knob) shadow-(--zk-knob-shadow) transition-[left] duration-150 ${transparent ? "left-[16px]" : "left-[2px]"}`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {focusedLayerName ? (
                <div className="rounded-[4px] bg-zk-raised/50 px-3 py-2.5 text-[12px] text-zk-muted">
                  Focus mode: only {focusedLayerName} goes in the file. Exit focus mode to export every visible layer.
                </div>
              ) : layerCount > 1 && onFlattenLayers && (
                <div className="flex items-center justify-between gap-3 rounded-[4px] bg-zk-raised/50 px-3 py-2.5 text-[12px] text-zk-muted">
                  <span>{layerCount} layers. Visible layers are combined in the file.</span>
                  <button onClick={onFlattenLayers} className="shrink-0 font-semibold text-zk-text-2 hover:text-zk-text">
                    Merge layers
                  </button>
                </div>
              )}

              <div className="border-t border-zk-hairline pt-5">
                <SectionLabel>Share link</SectionLabel>
                <div className="mb-3 flex items-center justify-between gap-3 text-[13px] text-zk-text-2">
                  <span>Let people continue this drawing</span>
                  <button
                    role="switch"
                    aria-checked={allowContinue}
                    aria-label="Let people continue this drawing"
                    disabled={shareUrl !== null || sharing}
                    onClick={() => setAllowContinue(!allowContinue)}
                    className={`relative h-[18px] w-8 shrink-0 rounded-[3px] transition-colors disabled:cursor-default disabled:opacity-50 ${allowContinue ? "bg-zk-accent" : "bg-zk-hover"}`}
                  >
                    <span
                      className={`absolute top-[2px] h-[14px] w-[14px] rounded-[2px] bg-(--zk-knob) shadow-(--zk-knob-shadow) transition-[left] duration-150 ${allowContinue ? "left-[16px]" : "left-[2px]"}`}
                    />
                  </button>
                </div>
                {shareUrl ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1.5">
                      <input
                        readOnly
                        value={shareUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label="Share link"
                        className="h-9 min-w-0 flex-1 rounded-[4px] bg-zk-raised px-2.5 text-[12px] text-zk-text-2 outline-none focus-visible:outline-1 focus-visible:outline-zk-accent"
                      />
                      <button
                        onClick={() => copy(shareUrl)}
                        aria-label="Copy link"
                        className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-zk-raised text-zk-text hover:bg-zk-hover"
                      >
                        {copied ? <CheckIcon className="h-4 w-4 text-zk-accent" /> : <CopyIcon className="h-4 w-4" />}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open link"
                        className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-zk-raised text-zk-text hover:bg-zk-hover"
                      >
                        <ExternalLinkIcon className="h-4 w-4" />
                      </a>
                      {typeof navigator !== "undefined" && "share" in navigator && (
                        <button
                          onClick={nativeShare}
                          aria-label="Share via…"
                          className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-zk-raised text-zk-text hover:bg-zk-hover"
                        >
                          <ShareIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zk-muted">{copied ? "Copied. " : ""}Anyone with the link can play this drawing.</p>
                    <button
                      onClick={() => setShareUrl(null)}
                      className="self-start text-[12px] font-semibold text-zk-text-2 hover:text-zk-text"
                    >
                      Create another link
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={createLink}
                      disabled={sharing || !hasContent}
                      className="flex h-9 items-center justify-center gap-2 rounded-[4px] bg-zk-raised text-[13px] font-medium text-zk-text transition-colors hover:bg-zk-hover disabled:opacity-50"
                    >
                      {sharing ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                      {sharing ? "Creating link…" : "Create link"}
                    </button>
                    <p className="text-[11px] text-zk-muted">Anyone with the link can play this drawing.</p>
                  </div>
                )}
                {links.length > 0 && (
                  <div className="mt-4 flex max-h-[112px] flex-col gap-1.5 overflow-y-auto">
                    {links.map((l) => (
                      <div key={l.id} className="flex items-center gap-1.5 rounded-[4px] bg-zk-raised/50 px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-zk-text-2" title={l.url}>
                          {l.url.replace(/^https?:\/\//, "")}
                          {l.allowContinue && <span className="text-zk-muted"> · can continue</span>}
                        </span>
                        <button
                          onClick={() => copy(l.url)}
                          aria-label="Copy link"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-zk-text hover:bg-zk-hover"
                        >
                          <CopyIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => unshare(l)}
                          disabled={removingId === l.id}
                          className="shrink-0 px-1.5 text-[12px] font-semibold text-zk-text-2 hover:text-zk-text disabled:opacity-50"
                        >
                          {removingId === l.id ? "Removing…" : "Unshare"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] text-zk-muted">
                  Links are remembered in this browser. Clearing site data means you can't unshare them.
                </p>
                <a href="/vault?tab=shared" className="mt-1.5 inline-block text-[12px] font-semibold text-zk-text-2 hover:text-zk-text">
                  Manage all links
                </a>
              </div>
            </div>

            <div className="flex gap-2 border-t border-zk-hairline px-6 py-4">
              <button
                onClick={onClose}
                className="h-10 rounded-[4px] px-4 text-[13px] font-medium text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
              >
                Cancel
              </button>
              <button
                onClick={download}
                disabled={!hasContent}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] bg-zk-accent text-[14px] font-semibold text-zk-on-accent transition-[filter] hover:brightness-110 disabled:opacity-40"
              >
                <DownloadIcon className="h-4 w-4" />
                Download {format.toUpperCase()}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);

export default ExportDialog;
