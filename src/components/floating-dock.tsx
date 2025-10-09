"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Move, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import {
  Pen,
  Paintbrush,
  PenTool,
  Pencil,
  Eraser,
  Sparkles,
  Blend,
} from "lucide-react";
import type { BrushStyle } from "@/models/CanvasModel";

interface FloatingDockProps {
  isDrawingMode: boolean;
  onToggleDrawingMode: () => void;
  className?: string;
}

const FloatingDock: React.FC<FloatingDockProps> = observer(
  ({ isDrawingMode, onToggleDrawingMode, className }) => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();
    const [isVisible, setIsVisible] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const dockRef = useRef<HTMLDivElement>(null);

    // Detect mobile
    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const brushIcons: Record<BrushStyle, React.ReactNode> = {
      ink: <Pencil className="w-4 h-4" />,
      // marker removed from UI
      eraser: <Eraser className="w-4 h-4" />,
      spray: <Sparkles className="w-4 h-4" />,
      texture: <Blend className="w-4 h-4" />,
    } as any;

    const brushStyles: BrushStyle[] = ["ink", "eraser", "spray", "texture"];

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

    const handleBrushChange = (brush: BrushStyle) => {
      canvasStore.setBrushStyle(brush);
      // Switch to drawing mode when selecting any brush
      if (!isDrawingMode) {
        onToggleDrawingMode();
      }
    };

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
            {/* Drawing/Pan Mode Toggle */}
            <Button
              variant={isDrawingMode ? "default" : "secondary"}
              size="sm"
              onClick={onToggleDrawingMode}
              className="h-9 w-9 p-0"
              title={
                isDrawingMode ? "Switch to Pan Mode" : "Switch to Draw Mode"
              }
            >
              {isDrawingMode ? (
                <Pen className="w-4 h-4" />
              ) : (
                <Move className="w-4 h-4" />
              )}
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <div className="flex items-center gap-1">
              {brushStyles.map((brush) => (
                <Button
                  key={brush}
                  variant={
                    canvasStore.currentBrushStyle === brush
                      ? "default"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() => handleBrushChange(brush)}
                  className="h-9 w-9 p-0 transition-all hover:scale-105"
                  title={`${
                    brush === "ink"
                      ? "Pen"
                      : brush.charAt(0).toUpperCase() + brush.slice(1)
                  } brush`}
                >
                  {brushIcons[brush]}
                </Button>
              ))}
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
