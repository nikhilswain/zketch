"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
import {
  useCanvasStore,
  useVaultStore,
  useSettingsStore,
} from "../hooks/useStores";
import DrawingCanvas from "./drawing-canvas";
import MobileSidebar from "./mobile-slider";
import FloatingDock from "./floating-dock";
import ExportDialog from "./export-dialog";
import { ExportService } from "@/services/ExportService";
import { ThumbnailService } from "@/services/ThumbnailService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { optimizeStrokes } from "@/utils/StrokeOptimizer";
import type { BackgroundType } from "@/models/CanvasModel";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { ArrowLeft, Menu, Save } from "lucide-react";
import type { ExportFormat } from "@/models/SettingsModel";

interface MobileCanvasViewProps {
  editingDrawingId: string | null;
  onBackToVault: () => void;
}

const MobileCanvasView: React.FC<MobileCanvasViewProps> = observer(
  ({ editingDrawingId, onBackToVault }) => {
    const canvasStore = useCanvasStore();
    const vaultStore = useVaultStore();
    const settingsStore = useSettingsStore();
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
    const [drawingName, setDrawingName] = useState("Untitled Drawing");
    const [isDrawingMode, setIsDrawingMode] = useState(true);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Track the current drawing ID (may differ from prop after first save of new drawing)
    const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(
      editingDrawingId,
    );

    // Sync with prop when it changes (e.g., navigating to edit a different drawing)
    useEffect(() => {
      setCurrentDrawingId(editingDrawingId);
    }, [editingDrawingId]);

    // Load drawing if editing existing one
    useEffect(() => {
      if (editingDrawingId) {
        const drawing = vaultStore.loadDrawing(editingDrawingId);
        if (drawing) {
          setDrawingName(drawing.name);
          canvasStore.setBackground(drawing.background as any);

          // Load layers from saved drawing - handle both stroke and image layers
          if (drawing.layers && drawing.layers.length > 0) {
            const layersData = drawing.layers.map((layer: any) => {
              const baseLayerData = {
                id: layer.id,
                name: layer.name,
                type: layer.type || "stroke",
                visible: layer.visible,
                locked: layer.locked,
                opacity: layer.opacity,
              };

              if (layer.type === "image") {
                return {
                  ...baseLayerData,
                  blobId: layer.blobId,
                  naturalWidth: layer.naturalWidth,
                  naturalHeight: layer.naturalHeight,
                  x: layer.x,
                  y: layer.y,
                  width: layer.width,
                  height: layer.height,
                  rotation: layer.rotation,
                  aspectLocked: layer.aspectLocked,
                };
              }

              // Stroke layer (default)
              return {
                ...baseLayerData,
                strokes: (layer.strokes || []).map((stroke: any) => ({
                  id: stroke.id,
                  points: stroke.points.map((p: any) => ({
                    x: p.x,
                    y: p.y,
                    pressure: p.pressure,
                  })),
                  color: stroke.color,
                  size: stroke.size,
                  opacity: stroke.opacity ?? 1,
                  brushStyle: stroke.brushStyle,
                  timestamp: stroke.timestamp,
                  // Animation timing
                  startTime: stroke.startTime ?? null,
                  duration: stroke.duration ?? null,
                  // Brush settings per-stroke
                  thinning: stroke.thinning,
                  smoothing: stroke.smoothing,
                  streamline: stroke.streamline,
                  taperStart: stroke.taperStart,
                  taperEnd: stroke.taperEnd,
                })),
              };
            });
            canvasStore.loadLayers(layersData as any, drawing.activeLayerId);
          } else {
            // No layers - start fresh
            canvasStore.clear();
          }
        }
      } else {
        canvasStore.clear();
        setDrawingName("Untitled Drawing");
      }
    }, [editingDrawingId, canvasStore, vaultStore]);

    // Handle window resize for mobile
    useEffect(() => {
      const updateCanvasSize = () => {
        const maxWidth = window.innerWidth - 32; // 16px padding on each side
        const maxHeight = window.innerHeight - 140; // Header + status bar
        setCanvasSize({
          width: Math.min(800, maxWidth),
          height: Math.min(600, maxHeight),
        });
      };

      updateCanvasSize();
      window.addEventListener("resize", updateCanvasSize);
      return () => window.removeEventListener("resize", updateCanvasSize);
    }, []);

    const handleSave = async () => {
      if (canvasStore.isEmpty) return;

      // Map layers to save format with optimized strokes
      const layersToSave = canvasStore.layers.map((layer) => {
        const baseLayerData = {
          id: layer.id,
          name: layer.name,
          type: layer.type,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
        };

        if (layer.type === "stroke") {
          const strokeLayer = layer as any;
          // Map strokes to plain objects first
          const strokesData = strokeLayer.strokes.map((stroke: any) => ({
            id: stroke.id,
            points: stroke.points.map((p: any) => ({
              x: p.x,
              y: p.y,
              pressure: p.pressure,
            })),
            color: stroke.color,
            size: stroke.size,
            opacity: stroke.opacity ?? 1,
            brushStyle: stroke.brushStyle,
            timestamp: stroke.timestamp,
            // Animation timing
            startTime: stroke.startTime ?? null,
            duration: stroke.duration ?? null,
            // Brush settings per-stroke
            thinning: stroke.thinning,
            smoothing: stroke.smoothing,
            streamline: stroke.streamline,
            taperStart: stroke.taperStart,
            taperEnd: stroke.taperEnd,
          }));

          // Optimize strokes using RDP algorithm
          const optimizedStrokes = optimizeStrokes(strokesData);

          return {
            ...baseLayerData,
            strokes: optimizedStrokes,
          };
        } else if (layer.type === "image") {
          const imageLayer = layer as any;
          return {
            ...baseLayerData,
            blobId: imageLayer.blobId,
            naturalWidth: imageLayer.naturalWidth,
            naturalHeight: imageLayer.naturalHeight,
            x: imageLayer.x,
            y: imageLayer.y,
            width: imageLayer.width,
            height: imageLayer.height,
            rotation: imageLayer.rotation,
            aspectLocked: imageLayer.aspectLocked,
          };
        }
        return baseLayerData;
      });

      // Generate thumbnail data URL with images support
      const thumbnailDataUrl = await ThumbnailService.generateThumbnailAsync(
        layersToSave as any,
        canvasStore.background,
        200,
        150,
      );

      // Store thumbnail as blob and get ID
      const thumbnailId =
        await BlobStorageService.storeThumbnail(thumbnailDataUrl);

      if (currentDrawingId) {
        await vaultStore.updateDrawing(
          currentDrawingId,
          thumbnailId,
          canvasStore.background as any,
          layersToSave as any,
          canvasStore.activeLayerId,
          drawingName,
        );
      } else {
        const newDrawing = await vaultStore.addDrawing(
          drawingName,
          thumbnailId,
          canvasStore.background as any,
          layersToSave as any,
          canvasStore.activeLayerId,
        );
        // Update currentDrawingId so subsequent saves update instead of creating new
        if (newDrawing) {
          setCurrentDrawingId(newDrawing.id);
        }
      }

      onBackToVault();
    };

    const handleExport = async (format: ExportFormat) => {
      if (canvasStore.isEmpty) return;

      try {
        let dataUrl: string;
        const background = canvasStore.background as BackgroundType;
        const allStrokes = canvasStore.flattenedStrokes;
        const exportLayers = canvasStore.exportLayers;

        switch (format) {
          case "png":
            dataUrl = await ExportService.exportToPNG(
              allStrokes as any,
              background,
              canvasSize.width,
              canvasSize.height,
              settingsStore.exportSettings,
              exportLayers as any,
            );
            break;
          case "jpg":
            dataUrl = await ExportService.exportToJPG(
              allStrokes as any,
              background,
              canvasSize.width,
              canvasSize.height,
              settingsStore.exportSettings,
              exportLayers as any,
            );
            break;
          case "svg":
            dataUrl = await ExportService.exportToSVG(
              allStrokes as any,
              background,
              canvasSize.width,
              canvasSize.height,
              settingsStore.exportSettings,
            );
            break;
          default:
            throw new Error(`Unsupported format: ${format}`);
        }

        const filename = `${drawingName
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase()}.${format}`;
        ExportService.downloadFile(dataUrl, filename);
      } catch (error) {
        console.error("Export failed:", error);
        alert("Export failed. Please try again.");
      }
    };

    const handleToggleDrawingMode = () => {
      setIsDrawingMode(!isDrawingMode);
    };

    const handleShowExportDialog = () => {
      setShowExportDialog(true);
      setSidebarOpen(false);
    };

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Mobile Header */}
        <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToVault}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <input
              type="text"
              value={drawingName}
              onChange={(e) => setDrawingName(e.target.value)}
              className="text-base font-semibold bg-transparent border-none outline-none focus:bg-gray-50 px-2 py-1 rounded max-w-[150px] sm:max-w-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              size="sm"
              disabled={canvasStore.isEmpty}
            >
              <Save className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0">
                <MobileSidebar
                  onSave={handleSave}
                  onExport={handleShowExportDialog}
                  onClose={() => setSidebarOpen(false)}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <DrawingCanvas
              width={canvasSize.width}
              height={canvasSize.height}
              isDrawingMode={isDrawingMode}
              className="border border-gray-200"
            />
          </div>

          <FloatingDock
            isDrawingMode={isDrawingMode}
            onToggleDrawingMode={handleToggleDrawingMode}
          />
        </div>

        {/* Mobile Status Bar */}
        <div className="bg-white border-t px-4 py-2 text-xs text-gray-600">
          <div className="flex items-center justify-between">
            <div>
              {isDrawingMode ? "Draw" : "Pan"} |{" "}
              {Math.round(canvasStore.zoom * 100)}%
            </div>
            <div>{canvasStore.strokes.length} strokes</div>
          </div>
        </div>

        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          onExport={handleExport}
          strokes={canvasStore.flattenedStrokes as any}
          background={canvasStore.background as BackgroundType}
          drawingName={drawingName}
          layerCount={canvasStore.layers.length}
          layers={canvasStore.exportLayers as any}
        />
      </div>
    );
  },
);

export default MobileCanvasView;
