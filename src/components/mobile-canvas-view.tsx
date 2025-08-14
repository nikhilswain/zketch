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

      const thumbnail = ThumbnailService.generateThumbnail(
        canvasStore.strokes,
        canvasStore.background,
        200,
        150
      );

      if (editingDrawingId) {
        await vaultStore.updateDrawing(
          editingDrawingId,
          canvasStore.strokes,
          thumbnail,
          canvasStore.background
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

      onBackToVault();
    };

    const handleExport = async (format: ExportFormat) => {
      if (canvasStore.isEmpty) return;

      try {
        let dataUrl: string;

        switch (format) {
          case "png":
            dataUrl = await ExportService.exportToPNG(
              canvasStore.strokes,
              canvasStore.background,
              canvasSize.width,
              canvasSize.height,
              settingsStore.exportSettings
            );
            break;
          case "jpg":
            dataUrl = await ExportService.exportToJPG(
              canvasStore.strokes,
              canvasStore.background,
              canvasSize.width,
              canvasSize.height,
              settingsStore.exportSettings
            );
            break;
          case "svg":
            dataUrl = await ExportService.exportToSVG(
              canvasStore.strokes,
              canvasStore.background,
              canvasSize.width,
              canvasSize.height,
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
          strokeCount={canvasStore.strokes.length}
        />
      </div>
    );
  }
);

export default MobileCanvasView;
