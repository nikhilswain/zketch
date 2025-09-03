"use client";

import type React from "react";
import { useState, useEffect } from "react";
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
import { ExportService } from "@/services/ExportService";
import { ThumbnailService } from "@/services/ThumbnailService";
import { Button } from "./ui/button";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { ExportFormat } from "@/models/SettingsModel";
import type { BackgroundType } from "@/models/CanvasModel";
import { toast } from "sonner";

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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
      canvasStore.clearHistory();
    }, []);

    // Load drawing if editing existing one
    useEffect(() => {
      if (editingDrawingId) {
        const drawing = vaultStore.loadDrawing(editingDrawingId);
        if (drawing) {
          canvasStore.replaceStrokes(drawing.strokes);
          setDrawingName(drawing.name);
          canvasStore.setBackground(drawing.background as any);
        }
      } else {
        canvasStore.clear();
        setDrawingName("Untitled Drawing");
      }
    }, [editingDrawingId, canvasStore, vaultStore]);

    //   // beforeunload
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

      const thumbnail = ThumbnailService.generateThumbnail(
        canvasStore.strokes,
        canvasStore.background,
        200,
        150
      );

      if (editingDrawingId) {
        await vaultStore.updateDrawing(
          editingDrawingId,
          canvasStore.strokes.map((stroke) => ({
            id: stroke.id,
            points: stroke.points.map((p) => ({
              x: p.x,
              y: p.y,
              pressure: p.pressure,
            })),
            color: stroke.color,
            size: stroke.size,
            brushStyle: stroke.brushStyle,
            timestamp: stroke.timestamp,
          })),
          thumbnail,
          canvasStore.background as any
        );
      } else {
        await vaultStore.addDrawing(
          drawingName,
          canvasStore.strokes.map((stroke) => ({
            id: stroke.id,
            points: stroke.points.map((p) => ({
              x: p.x,
              y: p.y,
              pressure: p.pressure,
            })),
            color: stroke.color,
            size: stroke.size,
            brushStyle: stroke.brushStyle,
            timestamp: stroke.timestamp,
          })),
          thumbnail,
          canvasStore.background as any
        );
      }

      toast.success("Drawing saved successfully!");
    };

    const handleExport = async (format: ExportFormat) => {
      if (canvasStore.isEmpty) return;

      try {
        let dataUrl: string;
        const exportSize = { width: 1920, height: 1080 };

        switch (format) {
          case "png":
            dataUrl = await ExportService.exportToPNG(
              canvasStore.strokes,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
              settingsStore.exportSettings
            );
            break;
          case "jpg":
            dataUrl = await ExportService.exportToJPG(
              canvasStore.strokes,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
              settingsStore.exportSettings
            );
            break;
          case "svg":
            dataUrl = await ExportService.exportToSVG(
              canvasStore.strokes,
              canvasStore.background as BackgroundType,
              exportSize.width,
              exportSize.height,
              settingsStore.exportSettings
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
            onChange={(e) => setDrawingName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:bg-gray-50 px-2 py-1 rounded"
          />
        </div>

        {/* Full-screen canvas */}
        <DrawingCanvas isDrawingMode={isDrawingMode} />

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
          strokes={canvasStore.strokes}
          background={canvasStore.background as BackgroundType}
          drawingName={drawingName}
        />
      </div>
    );
  }
);

export default CanvasView;
