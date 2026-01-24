"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  useCanvasStore,
  useVaultStore,
  useSettingsStore,
} from "@/hooks/useStores";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import Sidebar from "./slider";
import DrawingCanvas from "./drawing-canvas";
import FloatingDock from "./floating-dock";
import ExportDialog from "./export-dialog";
import ImportDialog from "./import-dialog";
import LayersPanel from "./layers-panel";
import { ExportService } from "@/services/ExportService";
import { ThumbnailService } from "@/services/ThumbnailService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { optimizeStrokes } from "@/utils/StrokeOptimizer";
import { Button } from "./ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Layers } from "lucide-react";
import type { ExportFormat } from "@/models/SettingsModel";
import type { BackgroundType } from "@/models/CanvasModel";
import { toast } from "sonner";
import { Input } from "./ui/input";

interface CanvasViewProps {
  editingDrawingId: string | null;
  onBackToVault: () => void;
}

const CanvasView: React.FC<CanvasViewProps> = observer(
  ({ editingDrawingId, onBackToVault }) => {
    const canvasStore = useCanvasStore();
    const vaultStore = useVaultStore();
    const settingsStore = useSettingsStore();
    const [drawingName, setDrawingName] = useState("Untitled Drawing");
    const [isDrawingMode, setIsDrawingMode] = useState(true);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [layersPanelCollapsed, setLayersPanelCollapsed] = useState(false);
    // Track the current drawing ID (may differ from prop after first save of new drawing)
    const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(
      editingDrawingId,
    );
    // Track if rename was just done (to prevent double toast from Enter + blur)
    const justRenamedRef = useRef(false);

    // Sync with prop when it changes (e.g., navigating to edit a different drawing)
    useEffect(() => {
      setCurrentDrawingId(editingDrawingId);
    }, [editingDrawingId]);

    useEffect(() => {
      canvasStore.clearHistory();
    }, []);

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

    //   ! beforeunload handling.
    // useEffect(() => {
    //   const handleBeforeUnload = (event: BeforeUnloadEvent) => {

    //     // check if any changes.
    //     event.preventDefault();
    //     event.returnValue = "";
    //   };

    //   window.addEventListener("beforeunload", handleBeforeUnload);
    //   return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    // }, []);

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

      toast.success("Drawing saved successfully!");
    };

    // Rename drawing (without saving all content)
    const handleRename = async (showToast = true) => {
      if (currentDrawingId && drawingName.trim()) {
        await vaultStore.renameDrawing(currentDrawingId, drawingName.trim());
        if (showToast) {
          toast.success("Drawing renamed!");
        }
      }
    };

    const handleExport = async (format: ExportFormat) => {
      if (canvasStore.isEmpty) return;

      try {
        let dataUrl: string;
        const exportSize = { width: 1920, height: 1080 };
        // Get all strokes from visible layers for export
        const allStrokes = canvasStore.flattenedStrokes;
        // Get all layers for export (includes images)
        const exportLayers = canvasStore.exportLayers;

        switch (format) {
          case "png":
            dataUrl = await ExportService.exportToPNG(
              allStrokes as any,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
              settingsStore.exportSettings,
              exportLayers as any,
            );
            break;
          case "jpg":
            dataUrl = await ExportService.exportToJPG(
              allStrokes as any,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
              settingsStore.exportSettings,
              exportLayers as any,
            );
            break;
          case "svg":
            dataUrl = await ExportService.exportToSVG(
              allStrokes as any,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
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
    };

    // Add keyboard shortcuts
    useKeyboardShortcuts(handleSave, handleShowExportDialog);

    return (
      <div className="fixed inset-0 bg-gray-100">
        {/* Floating sidebar */}
        <div
          className={`fixed top-0 left-0 h-full transition-all duration-300 z-10 ${
            sidebarCollapsed ? "w-12" : "w-80"
          }`}
        >
          {sidebarCollapsed ? (
            <div className="w-12 bg-white/90 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 h-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarCollapsed(false)}
                className="p-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-sm border-r border-gray-200 h-full">
              <Sidebar
                onSave={handleSave}
                onExport={handleShowExportDialog}
                onImport={() => setShowImportDialog(true)}
                onCollapse={() => setSidebarCollapsed(true)}
                isDrawingMode={isDrawingMode}
                onForceDrawingMode={() => setIsDrawingMode(true)}
              />
            </div>
          )}
        </div>

        {/* Floating header */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-4 z-10">
          <Button
            variant="ghost"
            onClick={onBackToVault}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Vault
          </Button>
          <input
            type="text"
            value={drawingName}
            onChange={(e) => {
              e.stopPropagation();
              setDrawingName(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                // Just rename on Enter, don't save entire drawing
                justRenamedRef.current = true;
                handleRename(true);
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              // Also rename when losing focus (if drawing exists)
              // Skip if we just renamed via Enter key
              if (justRenamedRef.current) {
                justRenamedRef.current = false;
                return;
              }
              if (currentDrawingId && drawingName.trim()) {
                handleRename(false); // Silent on blur, just persist
              }
            }}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:bg-gray-50 px-2 py-1 rounded"
          />
        </div>

        {/* Full-screen canvas */}
        <DrawingCanvas isDrawingMode={isDrawingMode} />

        {/* Layers Panel - Right side */}
        <div
          className={`fixed top-20 right-4 transition-all duration-300 z-10 ${
            layersPanelCollapsed ? "w-16" : "w-64"
          }`}
        >
          {layersPanelCollapsed ? (
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLayersPanelCollapsed(false)}
                className="p-2 w-full flex items-center justify-center"
                title="Show Layers Panel"
              >
                <Layers className="w-4 h-4 mr-1" />
                <ChevronLeft className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg">
              <div className="flex items-center justify-end p-1 border-b border-gray-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLayersPanelCollapsed(true)}
                  className="p-1 h-6 w-6"
                  title="Hide Layers Panel"
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
              <LayersPanel />
            </div>
          )}
        </div>

        {/* Floating dock */}
        <FloatingDock
          isDrawingMode={isDrawingMode}
          onToggleDrawingMode={handleToggleDrawingMode}
        />

        {/* Export Dialog */}
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          onExport={handleExport}
          strokes={canvasStore.flattenedStrokes as any}
          background={canvasStore.background as BackgroundType}
          drawingName={drawingName}
          layerCount={canvasStore.layerCount}
          onFlattenLayers={() => canvasStore.flattenAllLayers()}
          layers={canvasStore.exportLayers as any}
        />

        {/* Import Dialog */}
        <ImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          canvasWidth={1920}
          canvasHeight={1080}
        />
      </div>
    );
  },
);

export default CanvasView;
