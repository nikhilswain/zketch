"use client";

import type React from "react";
import { useState, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  Upload,
  Link,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { ImportService, type ImportResult } from "@/services/ImportService";
import { useCanvasStore } from "@/hooks/useStores";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

type ImportTab = "file" | "url";

const ImportDialog: React.FC<ImportDialogProps> = observer(
  ({ isOpen, onClose, canvasWidth, canvasHeight }) => {
    const canvasStore = useCanvasStore();
    const [activeTab, setActiveTab] = useState<ImportTab>("file");
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [importResults, setImportResults] = useState<ImportResult[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportComplete = useCallback(
      (results: ImportResult[]) => {
        const successful = results.filter((r) => r.success);

        // Add image layers for successful imports
        successful.forEach((result) => {
          if (result.blobId && result.width && result.height) {
            canvasStore.addImageLayer(
              result.blobId,
              result.originalWidth || result.width,
              result.originalHeight || result.height,
              canvasWidth,
              canvasHeight,
              result.fileName
            );
          }
        });

        setImportResults(results);

        // Close dialog after short delay if all successful
        if (results.length > 0 && results.every((r) => r.success)) {
          setTimeout(() => {
            handleClose();
          }, 500);
        }
      },
      [canvasStore, canvasWidth, canvasHeight]
    );

    const handleFileSelect = useCallback(
      async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setIsLoading(true);
        setError(null);
        setImportResults([]);

        try {
          const results = await ImportService.importFromFiles(files);
          handleImportComplete(results);

          const failures = results.filter((r) => !r.success);
          if (failures.length > 0) {
            setError(
              failures.map((f) => f.error).join(", ") ||
                "Some images failed to import"
            );
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed");
        } finally {
          setIsLoading(false);
        }
      },
      [handleImportComplete]
    );

    const handleUrlImport = useCallback(async () => {
      if (!url.trim()) {
        setError("Please enter a URL");
        return;
      }

      setIsLoading(true);
      setError(null);
      setImportResults([]);

      try {
        const result = await ImportService.importFromUrl(url.trim());
        handleImportComplete([result]);

        if (!result.success) {
          setError(result.error || "Failed to import image from URL");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setIsLoading(false);
      }
    }, [url, handleImportComplete]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!e.dataTransfer.files.length) return;

        await handleFileSelect(e.dataTransfer.files);
      },
      [handleFileSelect]
    );

    const handleClose = () => {
      setUrl("");
      setError(null);
      setImportResults([]);
      setIsLoading(false);
      onClose();
    };

    const handleBrowseClick = () => {
      fileInputRef.current?.click();
    };

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className="max-w-[460px] gap-5"
        >
          <div>
            <DialogTitle className="text-[26px]">Import image</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-zk-muted">
              Each image lands on a new layer above the current one.
            </DialogDescription>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-[4px] bg-zk-raised/50 p-1" role="tablist" aria-label="Import from">
            {([
              { id: "file", label: "From file", icon: Upload },
              { id: "url", label: "From link", icon: Link },
            ] as const).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  setError(null);
                }}
                className={`flex h-8 items-center justify-center gap-2 rounded-[3px] text-[13px] transition-colors ${
                  activeTab === t.id ? "bg-zk-selected font-semibold text-zk-text" : "text-zk-muted hover:text-zk-text"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "file" && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose images to import"
              className={`flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed px-6 text-center transition-colors ${
                isDragOver
                  ? "border-zk-accent bg-zk-selected"
                  : "border-zk-divider bg-zk-raised/40 hover:bg-zk-raised/70"
              } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleBrowseClick();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                multiple
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              {isLoading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-zk-muted" />
                  <p className="text-[13px] text-zk-text-2">Importing…</p>
                </>
              ) : (
                <>
                  <ImageIcon className={`h-7 w-7 ${isDragOver ? "text-zk-accent" : "text-zk-muted"}`} />
                  <p className="text-[14px] font-medium text-zk-text">
                    {isDragOver ? "Drop to import" : "Drop images here, or click to browse"}
                  </p>
                  <p className="text-[12px] text-zk-muted">PNG, JPEG, GIF, WebP or SVG. You can also paste with Ctrl+V on the canvas.</p>
                </>
              )}
            </div>
          )}

          {activeTab === "url" && (
            <div className="flex flex-col gap-2">
              <label htmlFor="image-url" className="text-[13px] text-zk-text-2">
                Image address
              </label>
              <div className="flex gap-2">
                <input
                  id="image-url"
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={url}
                  autoFocus
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUrlImport();
                    }
                  }}
                  className="h-10 min-w-0 flex-1 rounded-[4px] bg-zk-raised px-3 text-[13px] text-zk-text placeholder:text-zk-disabled outline-none focus-visible:outline-1 focus-visible:outline-zk-accent"
                />
                <button
                  onClick={handleUrlImport}
                  disabled={isLoading || !url.trim()}
                  className="flex h-10 w-24 items-center justify-center rounded-[4px] bg-zk-accent text-[13px] font-semibold text-zk-on-accent hover:brightness-110 disabled:opacity-40"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
                </button>
              </div>
              <p className="text-[12px] text-zk-muted">Some sites block other apps from loading their images.</p>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-[4px] bg-[#3a1f1f] px-3 py-2.5 text-[12px] text-[#ffb4a8]">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {importResults.length > 0 && importResults.every((r) => r.success) && (
            <div role="status" className="flex items-center gap-2 rounded-[4px] bg-zk-selected px-3 py-2.5 text-[12px] text-zk-text">
              <CheckCircle className="h-4 w-4 shrink-0 text-zk-accent" />
              <span>{importResults.length === 1 ? "Image added to the canvas." : `${importResults.length} images added to the canvas.`}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="h-9 rounded-[4px] px-4 text-[13px] font-medium text-zk-text-2 hover:bg-zk-raised hover:text-zk-text"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default ImportDialog;
