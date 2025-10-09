import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Undo2,
  Redo2,
  Trash2,
  Save,
  Download,
  Palette,
  Brush,
  Grid3X3,
  Square,
  SquareDot,
  X,
} from "lucide-react";
import type { BrushStyle, BackgroundType } from "../models/CanvasModel";

interface MobileSidebarProps {
  onSave: () => void;
  onExport: () => void;
  onClose: () => void;
}

const MobileSidebar: React.FC<MobileSidebarProps> = observer(
  ({ onSave, onExport, onClose }) => {
    const canvasStore = useCanvasStore();

    const brushStyles: { value: BrushStyle; label: string }[] = [
      { value: "ink", label: "Pen" },
      { value: "eraser", label: "Eraser" },
      { value: "spray", label: "Spray" },
      { value: "texture", label: "Texture" },
    ];

    const backgroundOptions: {
      value: BackgroundType;
      label: string;
      icon: React.ReactNode;
    }[] = [
      { value: "white", label: "White", icon: <Square className="w-4 h-4" /> },
      {
        value: "transparent",
        label: "Transparent",
        icon: <SquareDot className="w-4 h-4" />,
      },
      { value: "grid", label: "Grid", icon: <Grid3X3 className="w-4 h-4" /> },
    ];

    const commonColors = [
      "#000000",
      "#FF0000",
      "#00FF00",
      "#0000FF",
      "#FFFF00",
      "#FF00FF",
      "#00FFFF",
      "#FFA500",
      "#800080",
      "#FFC0CB",
      "#A52A2A",
      "#808080",
    ];

    const handleColorChange = (color: string) => {
      canvasStore.setColor(color);
    };

    const handleSizeChange = (value: number[]) => {
      canvasStore.setPenSize(value[0]);
    };

    const handleBrushChange = (value: string) => {
      canvasStore.setBrushStyle(value as BrushStyle);
    };

    const handleBackgroundChange = (value: string) => {
      canvasStore.setBackground(value as BackgroundType);
    };

    const handleClear = () => {
      if (
        confirm(
          "Are you sure you want to clear the canvas? This action cannot be undone."
        )
      ) {
        canvasStore.clear();
      }
      onClose();
    };

    const handleSave = () => {
      onSave();
      onClose();
    };

    const handleExport = () => {
      onExport();
      onClose();
    };

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Drawing Tools
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Brush Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Brush className="w-4 h-4" />
              <Label className="font-medium">Brush</Label>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-sm text-gray-600">Style</Label>
                <Select
                  value={canvasStore.currentBrushStyle}
                  onValueChange={handleBrushChange}
                >
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {brushStyles.map((brush) => (
                      <SelectItem key={brush.value} value={brush.value}>
                        {brush.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-gray-600">
                  Size: {canvasStore.currentSize}px
                </Label>
                <Slider
                  value={[canvasStore.currentSize]}
                  onValueChange={handleSizeChange}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full mt-2"
                />
              </div>

              <div>
                <Label className="text-sm text-gray-600">
                  Opacity:{" "}
                  {Math.round((canvasStore.brushSettings.opacity ?? 1) * 100)}%
                </Label>
                <Slider
                  value={[canvasStore.brushSettings.opacity ?? 1]}
                  onValueChange={(v) =>
                    canvasStore.setBrushSettings({ opacity: v[0] })
                  }
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full mt-2"
                />
              </div>
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <Label className="font-medium">Color</Label>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {commonColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-10 h-10 rounded border-2 transition-all ${
                    canvasStore.currentColor === color
                      ? "border-gray-900 scale-110"
                      : "border-gray-300"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="color"
                value={canvasStore.currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={canvasStore.currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded"
                placeholder="#000000"
              />
            </div>
          </div>

          {/* Background */}
          <div className="space-y-3">
            <Label className="font-medium">Background</Label>
            <Select
              value={canvasStore.background}
              onValueChange={handleBackgroundChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {backgroundOptions.map((bg) => (
                  <SelectItem key={bg.value} value={bg.value}>
                    <div className="flex items-center gap-2">
                      {bg.icon}
                      {bg.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Label className="font-medium">Actions</Label>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={canvasStore.undo}
                disabled={!canvasStore.canUndo}
              >
                <Undo2 className="w-4 h-4 mr-1" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={canvasStore.redo}
                disabled={!canvasStore.canRedo}
              >
                <Redo2 className="w-4 h-4 mr-1" />
                Redo
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="w-full bg-transparent"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Canvas
            </Button>

            <Button
              onClick={handleSave}
              className="w-full"
              disabled={canvasStore.isEmpty}
            >
              <Save className="w-4 h-4 mr-2" />
              Save to Vault
            </Button>

            <Button
              onClick={handleExport}
              variant="outline"
              disabled={canvasStore.isEmpty}
              className="w-full bg-transparent"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Drawing
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

export default MobileSidebar;
