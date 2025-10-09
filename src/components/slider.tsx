import type React from "react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { ZColorPicker, type ZColorResult } from "@zzro/z-color-picker";
import "@zzro/z-color-picker/styles";

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
import type { BackgroundType } from "@/models/CanvasModel";

interface SidebarProps {
  onSave: () => void;
  onExport: () => void;
  onCollapse?: () => void;
  className?: string;
  isDrawingMode?: boolean;
  onForceDrawingMode?: () => void;
}

const Sidebar: React.FC<SidebarProps> = observer(
  ({
    onSave,
    onExport,
    onCollapse,
    className,
    isDrawingMode,
    onForceDrawingMode,
  }) => {
    const canvasStore = useCanvasStore();
    const [showClearModal, setShowClearModal] = useState(false);
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
    ];

    const handleColorChange = (color: ZColorResult<["hex"]>) => {
      canvasStore.setColor(color.hex);
    };

    const handleCustomColorChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      canvasStore.setColor(e.target.value);
    };

    const handleSizeChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setPenSize(value[0]);
    };

    const handleEraserSizeChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setEraserSize(value[0]);
    };

    const handleBackgroundChange = (value: BackgroundType) => {
      canvasStore.setBackground(value);
    };

    const handleClear = () => {
      setShowClearModal(true);
    };

    const confirmClear = () => {
      canvasStore.clear();
      setShowClearModal(false);
    };

    const cancelClear = () => {
      setShowClearModal(false);
    };

    const handleThinningChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setBrushSettings({ thinning: value[0] });
    };

    const handleSmoothingChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setBrushSettings({ smoothing: value[0] });
    };

    const handleStreamlineChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setBrushSettings({ streamline: value[0] });
    };

    const handleTaperStartChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setBrushSettings({ taperStart: value[0] });
    };

    const handleTaperEndChange = (value: number[]) => {
      if (!isDrawingMode && onForceDrawingMode) {
        onForceDrawingMode();
      }
      canvasStore.setBrushSettings({ taperEnd: value[0] });
    };

    return (
      <>
        {showClearModal &&
          createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-sm">
              <div className="bg-white rounded shadow-lg p-6 w-80 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4">Clear Canvas?</h3>
                <p className="mb-6 text-sm text-gray-700">
                  Are you sure you want to clear the canvas? This action cannot
                  be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={cancelClear}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={confirmClear}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )}
        <div
          className={`w-80 bg-white border-r border-gray-200 flex flex-col ${className}`}
        >
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Drawing Tools
              </h2>
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

          <div className="h-[88vh] overflow-y-auto p-4 space-y-6">
            {/* Brush Settings: Size + Opacity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {canvasStore.currentBrushStyle === "eraser"
                    ? "Eraser"
                    : "Brush"}{" "}
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600">
                    {/* Size: {canvasStore.currentSize}px */}
                    Size:{" "}
                    <span className="font-semibold">
                      {canvasStore.currentBrushStyle === "eraser"
                        ? canvasStore.eraserSize
                        : canvasStore.currentSize}
                      px
                    </span>
                  </Label>
                  <Slider
                    value={
                      canvasStore.currentBrushStyle === "eraser"
                        ? [canvasStore.eraserSize]
                        : [canvasStore.currentSize]
                    }
                    onValueChange={
                      canvasStore.currentBrushStyle === "eraser"
                        ? handleEraserSizeChange
                        : handleSizeChange
                    }
                    min={1}
                    max={canvasStore.currentBrushStyle === "eraser" ? 100 : 50}
                    step={1}
                    className="w-full"
                  />
                </div>

                {canvasStore.currentBrushStyle !== "eraser" && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">
                      Opacity:{" "}
                      {Math.round(
                        (canvasStore.brushSettings.opacity ?? 1) * 100
                      )}
                      %
                    </Label>
                    <Slider
                      value={[canvasStore.brushSettings.opacity ?? 1]}
                      onValueChange={(v) => {
                        if (!isDrawingMode && onForceDrawingMode)
                          onForceDrawingMode();
                        canvasStore.setBrushSettings({ opacity: v[0] });
                      }}
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {canvasStore.currentBrushStyle === "ink" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Pen Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">
                      Thinning:{" "}
                      {(canvasStore.brushSettings.thinning * 100).toFixed(0)}%
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
                      {(canvasStore.brushSettings.smoothing * 100).toFixed(0)}%
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
                      {(canvasStore.brushSettings.streamline * 100).toFixed(0)}%
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
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">
                      Taper Start: {canvasStore.brushSettings.taperStart}
                    </Label>
                    <Slider
                      value={[canvasStore.brushSettings.taperStart]}
                      onValueChange={handleTaperStartChange}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">
                      Taper End: {canvasStore.brushSettings.taperEnd}
                    </Label>
                    <Slider
                      value={[canvasStore.brushSettings.taperEnd]}
                      onValueChange={handleTaperEndChange}
                      min={0}
                      max={100}
                      step={1}
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
              <CardContent className="space-y-4 overflow-auto">
                <ZColorPicker
                  initialColor={{ r: 0, g: 0, b: 0, a: 1 }}
                  size={220}
                  formats={["hex"]}
                  onChange={handleColorChange}
                  showColorRings={true}
                  showBrightnessBar={true}
                  colorRingsPalette={commonColors}
                />
              </CardContent>
            </Card>

            {/* Background */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Background
                </CardTitle>
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
                          : "border-gray-300 hover:border-assNam00"
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
      </>
    );
  }
);

export default Sidebar;
