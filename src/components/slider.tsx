import type React from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import {
  Undo2,
  Redo2,
  Trash2,
  Save,
  Download,
  Palette,
  Grid3X3,
  Square,
  SquareDot,
  ChevronLeft,
} from "lucide-react";
import type { BackgroundType } from "@/models/canvas-model";

interface SidebarProps {
  onSave: () => void;
  onExport: () => void;
  onCollapse?: () => void;
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = observer(
  ({ onSave, onExport, onCollapse, className }) => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();

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
      "#000000", // Black
      "#FF0000", // Red
      "#00FF00", // Green
      "#0000FF", // Blue
      "#FFFF00", // Yellow
      "#FF00FF", // Magenta
      "#00FFFF", // Cyan
      "#FFA500", // Orange
      "#800080", // Purple
      "#FFC0CB", // Pink
      "#A52A2A", // Brown
      "#808080", // Gray
    ];

    const handleColorChange = (color: string) => {
      canvasStore.setColor(color);
    };

    const handleCustomColorChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      canvasStore.setColor(e.target.value);
    };

    const handleSizeChange = (value: number[]) => {
      canvasStore.setPenSize(value[0]);
    };

    const handleBackgroundChange = (value: BackgroundType) => {
      canvasStore.setBackground(value);
    };

    const handleClear = () => {
      if (
        confirm(
          "Are you sure you want to clear the canvas? This action cannot be undone."
        )
      ) {
        canvasStore.clear();
      }
    };

    const handleThinningChange = (value: number[]) => {
      canvasStore.setBrushSettings({ thinning: value[0] });
    };

    const handleSmoothingChange = (value: number[]) => {
      canvasStore.setBrushSettings({ smoothing: value[0] });
    };

    const handleStreamlineChange = (value: number[]) => {
      canvasStore.setBrushSettings({ streamline: value[0] });
    };

    return (
      <div
        className={`w-80 bg-white border-r border-gray-200 flex flex-col ${className}`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Drawing Tools
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Use the floating dock below for brush selection
            </p>
          </div>
          {onCollapse && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCollapse}
              className="p-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Pen Size */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pen Size</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-600">
                  Size: {canvasStore.currentSize}px
                </Label>
                <Slider
                  value={[canvasStore.currentSize]}
                  onValueChange={handleSizeChange}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {canvasStore.currentBrushStyle === "ink" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Ink Brush Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600">
                    Thinning:{" "}
                    {Math.round(canvasStore.brushSettings.thinning * 100)}%
                  </Label>
                  <Slider
                    value={[canvasStore.brushSettings.thinning]}
                    onValueChange={handleThinningChange}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600">
                    Smoothing:{" "}
                    {Math.round(canvasStore.brushSettings.smoothing * 100)}%
                  </Label>
                  <Slider
                    value={[canvasStore.brushSettings.smoothing]}
                    onValueChange={handleSmoothingChange}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600">
                    Streamline:{" "}
                    {Math.round(canvasStore.brushSettings.streamline * 100)}%
                  </Label>
                  <Slider
                    value={[canvasStore.brushSettings.streamline]}
                    onValueChange={handleStreamlineChange}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Color Picker */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Color
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Color Palette */}
              <div className="grid grid-cols-6 gap-2">
                {commonColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      canvasStore.currentColor === color
                        ? "border-gray-900 scale-110"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>

              {/* Custom Color */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-600">
                  Custom Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={canvasStore.currentColor}
                    onChange={handleCustomColorChange}
                    className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={canvasStore.currentColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                    placeholder="#000000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Background */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Background</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {backgroundOptions.map((bg) => (
                  <button
                    key={bg.value}
                    onClick={() => handleBackgroundChange(bg.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all ${
                      canvasStore.background === bg.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {bg.icon}
                    <span className="text-xs">{bg.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Undo/Redo */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={canvasStore.undo}
                  disabled={!canvasStore.canUndo}
                  className="flex-1 bg-transparent"
                >
                  <Undo2 className="w-4 h-4 mr-1" />
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={canvasStore.redo}
                  disabled={!canvasStore.canRedo}
                  className="flex-1 bg-transparent"
                >
                  <Redo2 className="w-4 h-4 mr-1" />
                  Redo
                </Button>
              </div>

              {/* Clear */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="w-full bg-transparent"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Canvas
              </Button>

              {/* Save */}
              <Button
                onClick={onSave}
                className="w-full"
                disabled={canvasStore.isEmpty}
              >
                <Save className="w-4 h-4 mr-2" />
                Save to Vault
              </Button>
            </CardContent>
          </Card>

          {/* Export */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={onExport}
                disabled={canvasStore.isEmpty}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Drawing
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

export default Sidebar;
