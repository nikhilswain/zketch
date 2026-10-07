"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Shapes,
  Square,
  Circle,
  Diamond,
  Triangle,
  MousePointer2,
} from "lucide-react";
import {
  Pencil,
  Eraser,
  Brush,
  Highlighter,
  SprayCan,
  Feather,
  PencilLine,
  PenTool,
  Palette,
  Paintbrush,
  PaintbrushVertical,
  Cloud,
  Droplets,
} from "lucide-react";

const NumberBadge: React.FC<{ value: string; active?: boolean }> = ({
  value,
  active,
}) => (
  <span
    className={`absolute bottom-0.5 right-1 text-[9px] leading-none font-semibold pointer-events-none ${
      active ? "text-white/80" : "text-gray-400"
    }`}
  >
    {value}
  </span>
);
import type { BrushStyle } from "@/models/CanvasModel";
import type { ShapeKind } from "@/models/ShapeLayerModel";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { applyBrushPreset } from "@/utils/applyBrushPreset";

interface FloatingDockProps {
  className?: string;
}

const FloatingDock: React.FC<FloatingDockProps> = observer(
  ({ className }) => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();
    const [isVisible, setIsVisible] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [shapesPickerOpen, setShapesPickerOpen] = useState(false);
    const [brushPickerOpen, setBrushPickerOpen] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const dockRef = useRef<HTMLDivElement>(null);

    // Detect mobile
    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Picker visibility tracks the shape tool exactly — open iff shape is active.
    useEffect(() => {
      setShapesPickerOpen(canvasStore.activeTool === "shape");
    }, [canvasStore.activeTool]);

    const brushIcons: Record<string, React.ReactNode> = {
      ink: <Pencil className="w-4 h-4" />,
      marker: <Brush className="w-4 h-4" />,
      highlighter: <Highlighter className="w-4 h-4" />,
      airbrush: <SprayCan className="w-4 h-4" />,
      calligraphy: <Feather className="w-4 h-4" />,
      pencil: <PencilLine className="w-4 h-4" />,
      charcoal: <PenTool className="w-4 h-4" />,
      pastel: <Palette className="w-4 h-4" />,
      gouache: <Paintbrush className="w-4 h-4" />,
      drybrush: <PaintbrushVertical className="w-4 h-4" />,
      sponge: <Cloud className="w-4 h-4" />,
      splatter: <Droplets className="w-4 h-4" />,
    };

    const brushShortcuts: Record<string, string> = {
      ink: "2",
      pencil: "4",
      marker: "6",
      highlighter: "7",
      airbrush: "8",
      calligraphy: "9",
    };

    const pickerBrushes = brushRegistry.all().filter((b) => !b.legacy);

    // Auto-hide functionality
    useEffect(() => {
      if (!settingsStore.autoHideDock || isMobile) return;

      const resetHideTimer = () => {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }

        if (!isHovered) {
          hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
          }, settingsStore.dockHideDelay);
        }
      };

      const showDock = () => {
        setIsVisible(true);
        resetHideTimer();
      };

      const handleMouseMove = () => showDock();
      const handlePointerMove = () => showDock();

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("pointermove", handlePointerMove);

      resetHideTimer();

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("pointermove", handlePointerMove);
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
      };
    }, [
      isHovered,
      settingsStore.autoHideDock,
      settingsStore.dockHideDelay,
      isMobile,
    ]);

    const handleMouseEnter = () => {
      setIsHovered(true);
      setIsVisible(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
    };

    const handleZoomIn = () => {
      canvasStore.setZoom(Math.min(5, canvasStore.zoom * 1.2));
    };

    const handleZoomOut = () => {
      canvasStore.setZoom(Math.max(0.1, canvasStore.zoom / 1.2));
    };

    const handleFitToScreen = () => {
      canvasStore.setZoom(1);
      canvasStore.setPan(0, 0);
    };

    const selectBrush = (brush: BrushStyle) => {
      applyBrushPreset(canvasStore, brush);
    };

    const handleSelectTool = () => {
      canvasStore.setActiveTool("select");
    };

    const handlePanTool = () => {
      canvasStore.setActiveTool("pan");
    };

    const handleShapeTool = () => {
      canvasStore.setActiveTool("shape");
    };

    const handleShapeChange = (shape: ShapeKind) => {
      canvasStore.setCurrentShapeType(shape);
      canvasStore.setActiveTool("shape");
    };

    const shapeIcons: Record<ShapeKind, React.ReactNode> = {
      rectangle: <Square className="w-4 h-4" />,
      circle: <Circle className="w-4 h-4" />,
      diamond: <Diamond className="w-4 h-4" />,
      triangle: <Triangle className="w-4 h-4" />,
    };

    const shapeKinds: ShapeKind[] = ["rectangle", "circle", "diamond", "triangle"];

    if (!isVisible && settingsStore.autoHideDock && !isMobile) {
      return (
        <div
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-gray-400 rounded-full opacity-30 hover:opacity-100 transition-opacity cursor-pointer z-50"
          onMouseEnter={handleMouseEnter}
          title="Show dock"
        />
      );
    }

    return (
      <div
        ref={dockRef}
        className={`fixed bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        } ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Pan Tool */}
            <Button
              variant={canvasStore.activeTool === "pan" ? "default" : "ghost"}
              size="sm"
              onClick={handlePanTool}
              className="relative h-9 w-9 p-0"
              title="Pan / Hand"
            >
              <Hand className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <div className="flex items-center gap-1">
              <Button
                variant={canvasStore.activeTool === "select" ? "default" : "ghost"}
                size="sm"
                onClick={handleSelectTool}
                className="relative h-9 w-9 p-0 transition-all hover:scale-105"
                title="Select / Move (1 or V)"
              >
                <MousePointer2 className="w-4 h-4" />
                {canvasStore.activeTool !== "shape" && (
                  <NumberBadge
                    value="1"
                    active={canvasStore.activeTool === "select"}
                  />
                )}
              </Button>

              <div className="relative">
                <Button
                  variant={
                    canvasStore.activeTool === "brush" ? "default" : "ghost"
                  }
                  size="sm"
                  onClick={() => setBrushPickerOpen((v) => !v)}
                  className="relative h-9 w-9 p-0 transition-all hover:scale-105"
                  title="Brush (2)"
                >
                  {brushIcons[canvasStore.currentBrushStyle] ?? (
                    <Pencil className="w-4 h-4" />
                  )}
                  {canvasStore.activeTool !== "shape" && (
                    <NumberBadge
                      value={brushShortcuts[canvasStore.currentBrushStyle] ?? ""}
                      active={canvasStore.activeTool === "brush"}
                    />
                  )}
                </Button>

                {brushPickerOpen && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex flex-col gap-0.5 min-w-[168px]">
                    {pickerBrushes.map((b) => {
                      const isActive =
                        canvasStore.activeTool === "brush" &&
                        canvasStore.currentBrushStyle === b.key;
                      return (
                        <button
                          key={b.key}
                          onClick={() => {
                            selectBrush(b.key as BrushStyle);
                            setBrushPickerOpen(false);
                          }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <span className="w-4 h-4 flex items-center justify-center">
                            {brushIcons[b.key]}
                          </span>
                          <span className="flex-1 text-left">
                            {b.label ?? b.key}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {brushShortcuts[b.key] ?? ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button
                variant={
                  canvasStore.activeTool === "brush" &&
                  canvasStore.currentBrushStyle === "eraser"
                    ? "default"
                    : "ghost"
                }
                size="sm"
                onClick={() => {
                  canvasStore.setBrushStyle("eraser");
                  canvasStore.setActiveTool("brush");
                }}
                className="relative h-9 w-9 p-0 transition-all hover:scale-105"
                title="Eraser brush (3)"
              >
                <Eraser className="w-4 h-4" />
                {canvasStore.activeTool !== "shape" && (
                  <NumberBadge
                    value="3"
                    active={
                      canvasStore.activeTool === "brush" &&
                      canvasStore.currentBrushStyle === "eraser"
                    }
                  />
                )}
              </Button>

              <div className="relative">
                <Button
                  variant={canvasStore.activeTool === "shape" ? "default" : "ghost"}
                  size="sm"
                  onClick={handleShapeTool}
                  className="relative h-9 w-9 p-0 transition-all hover:scale-105"
                  title="Shapes (5)"
                >
                  <Shapes className="w-4 h-4" />
                  {canvasStore.activeTool !== "shape" && (
                    <NumberBadge
                      value="5"
                      active={canvasStore.activeTool === "shape"}
                    />
                  )}
                </Button>

                {shapesPickerOpen && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg px-2 py-2 flex items-center gap-1">
                    {shapeKinds.map((shape, idx) => {
                      const isActive =
                        canvasStore.activeTool === "shape" &&
                        canvasStore.currentShapeType === shape;
                      return (
                        <Button
                          key={shape}
                          variant={isActive ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleShapeChange(shape)}
                          className="relative h-9 w-9 p-0"
                          title={`${shape.charAt(0).toUpperCase() + shape.slice(1)} (${idx + 1})`}
                        >
                          {shapeIcons[shape]}
                          <NumberBadge value={String(idx + 1)} active={isActive} />
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                className="h-9 w-9 p-0"
                title="Zoom Out"
                disabled={canvasStore.zoom <= 0.1}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>

              <div className="px-2 py-1 text-xs font-medium text-gray-600 min-w-[3rem] text-center bg-gray-100 rounded">
                {Math.round(canvasStore.zoom * 100)}%
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                className="h-9 w-9 p-0"
                title="Zoom In"
                disabled={canvasStore.zoom >= 5}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleFitToScreen}
                className="h-9 w-9 p-0"
                title="Fit to Screen"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default FloatingDock;
