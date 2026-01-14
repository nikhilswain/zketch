"use client";

import type React from "react";
import { useState, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Import Image
            </DialogTitle>
            <DialogDescription>
              Add an image to your canvas as a new layer
            </DialogDescription>
          </DialogHeader>

          {/* Tab Buttons */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={activeTab === "file" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("file")}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              File
            </Button>
            <Button
              variant={activeTab === "url" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("url")}
              className="flex items-center gap-2"
            >
              <Link className="w-4 h-4" />
              URL
            </Button>
          </div>

          {/* File Upload Tab */}
          {activeTab === "file" && (
            <div className="space-y-4">
              <div
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors
                  ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : "border-gray-300 hover:border-gray-400"
                  }
                  ${isLoading ? "opacity-50 pointer-events-none" : ""}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
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
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-gray-600">Importing...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="text-sm font-medium">
                      Drop images here or click to browse
                    </p>
                    <p className="text-xs text-gray-500">
                      PNG, JPEG, GIF, WebP, SVG supported
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* URL Import Tab */}
          {activeTab === "url" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-url">Image URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="image-url"
                    type="url"
                    placeholder="https://example.com/image.png"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUrlImport();
                      }
                    }}
                  />
                  <Button
                    onClick={handleUrlImport}
                    disabled={isLoading || !url.trim()}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Import"
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Note: Some URLs may be blocked by CORS policies
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Display */}
          {importResults.length > 0 &&
            importResults.every((r) => r.success) && (
              <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {importResults.length === 1
                    ? "Image imported successfully!"
                    : `${importResults.length} images imported successfully!`}
                </span>
              </div>
            )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default ImportDialog;
