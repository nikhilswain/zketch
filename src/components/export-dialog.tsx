"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore } from "../hooks/useStores";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Checkbox } from "./ui/checkbox";
import { Download, Share2, Copy, FileImage, File, Loader2 } from "lucide-react";
import type { ExportFormat } from "@/models/SettingsModel";
import type { IStroke, BackgroundType } from "@/models/CanvasModel";
import { ExportService } from "@/services/ExportService";
import { ShareService } from "@/services/ShareService";
import { toast } from "sonner";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  strokes: IStroke[];
  background: BackgroundType;
  drawingName: string;
}

const ExportDialog: React.FC<ExportDialogProps> = observer(
  ({ isOpen, onClose, onExport, strokes, background, drawingName }) => {
    const settingsStore = useSettingsStore();
    const [previewDataUrl, setPreviewDataUrl] = useState<string>("");
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    // Generate preview whenever dialog opens or settings change
    useEffect(() => {
      if (isOpen) {
        generatePreview();
      }
    }, [isOpen, settingsStore.exportSettings, strokes, background]);

    const generatePreview = async () => {
      if (strokes.length === 0) return;

      setIsGeneratingPreview(true);
      try {
        const dataUrl = await ExportService.exportToPNG(
          strokes,
          background,
          400, // Small preview size
          300,
          { ...settingsStore.exportSettings, scale: 1 }
        );
        setPreviewDataUrl(dataUrl);
      } catch (error) {
        console.error("Failed to generate preview:", error);
      } finally {
        setIsGeneratingPreview(false);
      }
    };

    const handleExport = (format: ExportFormat) => {
      onExport(format);
      onClose();
    };

    const handleShare = async () => {
      if (isSharing) return;

      setIsSharing(true);

      try {
        // Export with higher quality for sharing (still optimized for size)
        const dataUrl = await ExportService.exportToJPG(
          strokes,
          background,
          800, // Decent resolution for sharing
          600,
          {
            ...settingsStore.exportSettings,
            scale: 1,
            quality: 0.8, // Good quality but still compressed
            transparentBackground: false, // JPG doesn't support transparency
          }
        );

        // Create share data
        const shareData = ShareService.createShareData(drawingName, dataUrl);

        // Check size before attempting to store
        const sizeCheck = ShareService.checkSizeLimit(shareData);
        if (!sizeCheck.valid) {
          toast.error(sizeCheck.message || "Drawing is too large to share");
          return;
        }

        // Store in Cloudflare KV
        const response = await ShareService.storeSharedDrawing(shareData);

        if (!response.success) {
          throw new Error(response.error || "Failed to create share link");
        }

        const shareUrl = response.shareUrl!;

        // Try native sharing first, fallback to clipboard
        if (navigator.share) {
          await navigator.share({
            title: `Check out my drawing: ${drawingName}`,
            text: `I created this drawing with ZKetch!`,
            url: shareUrl,
          });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          toast.success(`Share link copied to clipboard! (expires in 30 days)`);
        }
      } catch (error) {
        console.error("Failed to share:", error);

        if (error instanceof Error) {
          if (error.message.includes("too large")) {
            toast.error(
              "Drawing is too large to share. Try reducing complexity or export as a file instead."
            );
          } else if (error.message.includes("not available")) {
            toast.error(
              "Sharing service is temporarily unavailable. Please try again later."
            );
          } else {
            toast.error(error.message);
          }
        } else {
          toast.error("Failed to create share link. Please try again.");
        }
      } finally {
        setIsSharing(false);
      }
    };

    const handleQualityChange = (value: number[]) => {
      settingsStore.setExportSettings({ quality: value[0] / 100 });
    };

    const handleScaleChange = (value: number[]) => {
      settingsStore.setExportSettings({ scale: value[0] });
    };

    const handleTransparentChange = (checked: boolean) => {
      settingsStore.setExportSettings({ transparentBackground: checked });
    };

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-full h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Drawing: {drawingName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-6 h-full">
            {/* Left side - Preview */}
            <div className="flex-1 flex flex-col">
              <Label className="text-sm font-medium mb-3">Preview</Label>
              <div className="flex-1 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center min-h-[300px]">
                {isGeneratingPreview ? (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <span className="text-gray-500">Generating preview...</span>
                  </div>
                ) : previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain rounded"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <FileImage className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <span>No preview available</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right side - Export options */}
            <div className="w-80 flex flex-col">
              <div className="space-y-6 flex-1">
                {/* Export Buttons */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Export Format</Label>

                  {/* PNG Button */}
                  <Button
                    onClick={() => handleExport("png")}
                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center justify-center gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <FileImage className="w-5 h-5" />
                      <span className="font-semibold">PNG</span>
                    </div>
                    <span className="text-xs opacity-90">
                      Best quality • Supports transparency
                    </span>
                  </Button>

                  {/* JPG Button */}
                  <Button
                    onClick={() => handleExport("jpg")}
                    className="w-full h-16 bg-orange-600 hover:bg-orange-700 text-white flex flex-col items-center justify-center gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <FileImage className="w-5 h-5" />
                      <span className="font-semibold">JPG</span>
                    </div>
                    <span className="text-xs opacity-90">
                      Smaller file size • No transparency
                    </span>
                  </Button>

                  {/* SVG Button */}
                  <Button
                    onClick={() => handleExport("svg")}
                    className="w-full h-16 bg-green-600 hover:bg-green-700 text-white flex flex-col items-center justify-center gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <File className="w-5 h-5" />
                      <span className="font-semibold">SVG</span>
                    </div>
                    <span className="text-xs opacity-90">
                      Vector format • Infinitely scalable
                    </span>
                  </Button>
                </div>

                {/* Share Button */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Share</Label>
                  <Button
                    onClick={handleShare}
                    variant="outline"
                    disabled={isSharing}
                    className="w-full h-12 border-2 border-purple-200 hover:bg-purple-50 text-purple-700 hover:text-purple-800 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSharing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="font-medium">Creating Link...</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        <span className="font-medium">Create Share Link</span>
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500">
                    Creates a secure shareable URL that expires in 30 days.
                    Drawing data is stored safely in the cloud.
                  </p>
                </div>

                {/* Settings */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-sm font-medium">Export Settings</Label>

                  {/* Scale */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">
                      Quality Scale: {settingsStore.exportSettings.scale}x
                    </Label>
                    <Slider
                      value={[settingsStore.exportSettings.scale]}
                      onValueChange={handleScaleChange}
                      min={0.5}
                      max={4}
                      step={0.5}
                      className="w-full"
                    />
                  </div>

                  {/* Quality (for JPG) */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">
                      JPG Quality:{" "}
                      {Math.round(settingsStore.exportSettings.quality * 100)}%
                    </Label>
                    <Slider
                      value={[settingsStore.exportSettings.quality * 100]}
                      onValueChange={handleQualityChange}
                      min={10}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  {/* Transparent Background */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="transparent"
                      checked={
                        settingsStore.exportSettings.transparentBackground
                      }
                      onCheckedChange={handleTransparentChange}
                    />
                    <Label
                      htmlFor="transparent"
                      className="text-xs text-gray-600"
                    >
                      Transparent background (PNG/SVG only)
                    </Label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t">
                <Button variant="outline" onClick={onClose} className="w-full">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default ExportDialog;
