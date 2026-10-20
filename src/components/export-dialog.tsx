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
import { useSettingsStore } from "../hooks/useStores";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import StrokeTrack from "./studio/StrokeTrack";
import type { ExportFormat } from "@/models/SettingsModel";
import type { IStroke, BackgroundType } from "@/models/CanvasModel";
import { ExportService, type IExportLayer } from "@/services/ExportService";
import { ShareService } from "@/services/ShareService";
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
  ({ isOpen, onClose, onExport, strokes, background, drawingName, layerCount = 1, onFlattenLayers, layers, page = null, focusedLayerName = null }) => {
    const settingsStore = useSettingsStore();
    const { scale, quality, transparentBackground } = settingsStore.exportSettings;
    const format: "png" | "jpg" = settingsStore.exportSettings.format === "jpg" ? "jpg" : "png";
    const canvasTransparent = background === "transparent";
    const transparent = format === "png" && (transparentBackground || canvasTransparent);

    const [preview, setPreview] = useState("");
    const [rendering, setRendering] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const hasContent =
      strokes.length > 0 ||
      !!layers?.some(
        (l) => l.visible && (l.type === "image" || (l.type === "draw" && (l.elements?.length ?? 0) > 0)),
      );

    useEffect(() => {
      if (isOpen) {
        setShareUrl(null);
        setCopied(false);
      }
    }, [isOpen]);

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
        const dataUrl = page
          ? await ExportService.exportPage(
              layers ?? [],
              page,
              Math.min(1, 1200 / Math.max(page.width, page.height)),
              background,
              "jpg",
              { transparentBackground: false, quality: 0.8 },
            )
          : await ExportService.exportToJPG(
              strokes,
              background,
              800,
              600,
              { ...settingsStore.exportSettings, scale: 1, quality: 0.8, transparentBackground: false },
              layers,
            );
        const shareData = ShareService.createShareData(drawingName, dataUrl);
        const sizeCheck = ShareService.checkSizeLimit(shareData);
        if (!sizeCheck.valid) {
          toast.error(sizeCheck.message || "Drawing is too large to share");
          return;
        }
        const response = await ShareService.storeSharedDrawing(shareData);
        if (!response.success || !response.shareUrl) {
          throw new Error(response.error || "Failed to create share link");
        }
        setShareUrl(response.shareUrl);
        await copy(response.shareUrl);
      } catch (error) {
        console.error("Failed to share:", error);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("too large")) {
          toast.error("Drawing is too large to share. Export it as a file instead.");
        } else if (message.includes("not available")) {
          toast.error("Sharing is temporarily unavailable. Please try again later.");
        } else {
          toast.error(message || "Failed to create share link. Please try again.");
        }
      } finally {
        setSharing(false);
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
          className="flex h-[min(640px,calc(100vh-32px))] max-w-[960px] gap-0 overflow-hidden p-0"
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

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-4">
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
                    <p className="text-[11px] text-zk-muted">{copied ? "Copied. " : ""}View-only, expires in 30 days.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={createLink}
                      disabled={sharing || !hasContent}
                      className="flex h-9 items-center justify-center gap-2 rounded-[4px] bg-zk-raised text-[13px] font-medium text-zk-text transition-colors hover:bg-zk-hover disabled:opacity-50"
                    >
                      {sharing ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                      {sharing ? "Creating link…" : "Create share link"}
                    </button>
                    <p className="text-[11px] text-zk-muted">Anyone with the link can view the image for 30 days.</p>
                  </div>
                )}
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
