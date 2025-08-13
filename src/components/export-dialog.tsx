"use client";

import type React from "react";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useSettingsStore } from "../hooks/useStores";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Checkbox } from "./ui/checkbox";
import { Download } from "lucide-react";
import type { ExportFormat } from "@/models/settings-model";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  strokeCount: number;
}

const ExportDialog: React.FC<ExportDialogProps> = observer(
  ({ isOpen, onClose, onExport, strokeCount }) => {
    const settingsStore = useSettingsStore();
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("png");

    const handleExport = () => {
      onExport(selectedFormat);
      onClose();
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

    const formatOptions = [
      {
        value: "png" as const,
        label: "PNG",
        description: "Best for web, supports transparency",
      },
      {
        value: "jpg" as const,
        label: "JPG",
        description: "Smaller file size, no transparency",
      },
      {
        value: "svg" as const,
        label: "SVG",
        description: "Vector format, scalable",
      },
    ];

    const getEstimatedSize = () => {
      const baseSize = strokeCount * 0.5; // Rough estimate in KB
      const scaleMultiplier = settingsStore.exportSettings.scale ** 2;
      const formatMultiplier =
        selectedFormat === "jpg" ? 0.7 : selectedFormat === "svg" ? 0.3 : 1;
      return Math.round(baseSize * scaleMultiplier * formatMultiplier);
    };

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Drawing
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Format Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Format</Label>
              <Select
                value={selectedFormat}
                onValueChange={(value) =>
                  setSelectedFormat(value as ExportFormat)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      <div>
                        <div className="font-medium">{format.label}</div>
                        <div className="text-xs text-gray-500">
                          {format.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quality (for JPG) */}
            {selectedFormat === "jpg" && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Quality:{" "}
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
            )}

            {/* Scale */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Scale: {settingsStore.exportSettings.scale}x
              </Label>
              <Slider
                value={[settingsStore.exportSettings.scale]}
                onValueChange={handleScaleChange}
                min={0.5}
                max={4}
                step={0.5}
                className="w-full"
              />
              <div className="text-xs text-gray-500">
                Higher scale = better quality but larger file size
              </div>
            </div>

            {/* Transparent Background (not for JPG) */}
            {selectedFormat !== "jpg" && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="transparent"
                  checked={settingsStore.exportSettings.transparentBackground}
                  onCheckedChange={handleTransparentChange}
                />
                <Label htmlFor="transparent" className="text-sm">
                  Transparent background
                </Label>
              </div>
            )}

            {/* File Info */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Estimated size:</span>
                <span className="font-medium">{getEstimatedSize()} KB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Strokes:</span>
                <span className="font-medium">{strokeCount}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleExport} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export {selectedFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export default ExportDialog;
