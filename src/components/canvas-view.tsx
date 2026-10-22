"use client";

import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { observer } from "mobx-react-lite";
import {
  useCanvasStore,
  useVaultStore,
  useSettingsStore,
} from "@/hooks/useStores";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import DrawingCanvas from "./drawing-canvas";
import ExportDialog from "./export-dialog";
import ImportDialog from "./import-dialog";
import { ExportService } from "@/services/ExportService";
import { ThumbnailService } from "@/services/ThumbnailService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { exportDrawings } from "@/services/VaultBackup";
import { serializeLayers } from "@/utils/serializeLayers";
import { Button } from "./ui/button";
import { LockIcon } from "@/components/icons";
import StudioShell from "./studio/StudioShell";
import TopLeftBlock from "./studio/TopLeftBlock";
import TopRightBlock from "./studio/TopRightBlock";
import { StudioContext } from "./studio/StudioContext";
import SettingsPage from "./studio/SettingsPage";
import type { ExportFormat } from "@/models/SettingsModel";
import type { BackgroundType } from "@/models/CanvasModel";
import { toast } from "sonner";
import type { PlaybackElement } from "@/engine";
import type { PlaybackState } from "@/engine/AnimationPlaybackEngine";
import { reaction } from "mobx";
import { getSnapshot } from "mobx-state-tree";
import { effectiveExportScale, newPage, resizePage } from "@/utils/page";
import { fitView } from "@/utils/viewport";
import PageSizeDialog from "./PageSizeDialog";

interface CanvasViewProps {
  editingDrawingId: string | null;
  newPageSize?: { width: number; height: number } | null;
  onBackToVault: () => void;
}

const AUTOSAVE_DEBOUNCE_MS = 500;

const CanvasView: React.FC<CanvasViewProps> = observer(
  ({ editingDrawingId, newPageSize = null, onBackToVault }) => {
    const canvasStore = useCanvasStore();
    const vaultStore = useVaultStore();
    const settingsStore = useSettingsStore();
    const [drawingName, setDrawingName] = useState("Untitled Drawing");
    // Pan tool == "not drawing"; every other tool puts the canvas in drawing mode.
    const isDrawingMode = canvasStore.activeTool !== "pan";
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [showPageSize, setShowPageSize] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    // Track the current drawing ID (may differ from prop after first save of new drawing)
    const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(
      editingDrawingId,
    );
    const savedIdRef = useRef<string | null>(null);
    savedIdRef.current = currentDrawingId;
    // Track if rename was just done (to prevent double toast from Enter + blur)
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
    const isDirtyRef = useRef(false);
    const lastSavedRef = useRef<unknown[] | null>(null);
    const loadedStoreRef = useRef<unknown>(null);
    const autosaveTimerRef = useRef<number | null>(null);
    const saveStatusResetTimerRef = useRef<number | null>(null);

    // Animation playback state
    const [animatingLayerId, setAnimatingLayerId] = useState<string | null>(
      null,
    );
    const [animationFrame, setAnimationFrame] = useState<
      PlaybackElement[] | null
    >(null);

    // Animation callbacks
    const handleAnimationFrame = useCallback(
      (layerId: string, frame: PlaybackElement[]) => {
        setAnimatingLayerId(layerId);
        setAnimationFrame(frame);
      },
      [],
    );

    const handleAnimationStateChange = useCallback(
      (layerId: string, state: PlaybackState) => {
        if (state === "playing") {
          setAnimatingLayerId(layerId);
        } else if (state === "stopped") {
          setAnimatingLayerId(null);
          setAnimationFrame(null);
        }
      },
      [],
    );

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
          loadedStoreRef.current = canvasStore;
          setDrawingName(drawing.name);
          canvasStore.setBackground(drawing.background as any);
          canvasStore.loadPage(
            drawing.page
              ? { x: drawing.page.x, y: drawing.page.y, width: drawing.page.width, height: drawing.page.height }
              : null,
          );

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

              if (layer.type === "shape") {
                // Legacy single-shape layer — loader migrates into a draw layer.
                return {
                  ...baseLayerData,
                  shapeType: layer.shapeType,
                  x: layer.x,
                  y: layer.y,
                  width: layer.width,
                  height: layer.height,
                  rotation: layer.rotation,
                  strokeColor: layer.strokeColor,
                  strokeWidth: layer.strokeWidth,
                  cornerRadius: layer.cornerRadius,
                  fillColor: layer.fillColor ?? null,
                };
              }

              if (layer.type === "draw") {
                // New unified draw layer — pass elements through verbatim.
                return {
                  ...baseLayerData,
                  elements: layer.elements ?? [],
                };
              }

              // Legacy stroke layer (default)
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
                  easing: stroke.easing,
                  angle: stroke.angle,
                  softness: stroke.softness,
                  input: stroke.input ?? null,
                  tips: stroke.tips ?? null,
                })),
              };
            });
            canvasStore.loadLayers(layersData as any, drawing.activeLayerId);
            lastSavedRef.current = [
              getSnapshot(canvasStore.layers),
              canvasStore.background,
              canvasStore.activeLayerId,
              drawing.name,
              canvasStore.page ? getSnapshot(canvasStore.page) : null,
              editingDrawingId,
            ];
            requestAnimationFrame(() => {
              fitView(canvasStore);
            });
          } else {
            // No layers - start fresh
            canvasStore.clear();
          }
        }
      } else {
        loadedStoreRef.current = canvasStore;
        canvasStore.loadPage(newPageSize ? newPage(newPageSize.width, newPageSize.height) : null);
        canvasStore.clear();
        canvasStore.setBackground(settingsStore.defaultBackground as BackgroundType);
        setDrawingName("Untitled Drawing");
        requestAnimationFrame(() => {
          fitView(canvasStore);
        });
      }
    }, [editingDrawingId, canvasStore, vaultStore]);

    const performSave = async (): Promise<boolean> => {
      if (loadedStoreRef.current !== canvasStore) return false;
      if (canvasStore.isEmpty && !currentDrawingId) return false;

      const saved = [
        getSnapshot(canvasStore.layers),
        canvasStore.background,
        canvasStore.activeLayerId,
        drawingName,
        canvasStore.page ? getSnapshot(canvasStore.page) : null,
        currentDrawingId,
      ];
      const last = lastSavedRef.current;
      if (last && saved.every((v, i) => v === last[i])) {
        isDirtyRef.current = false;
        return true;
      }

      try {
        const layersToSave = serializeLayers(canvasStore.layers);

        const thumbnailBlob = await ThumbnailService.generateThumbnailBlob(
          layersToSave as any,
          canvasStore.background,
          200,
          150,
          canvasStore.page ? { ...canvasStore.page } : null,
        );

        const thumbnailId =
          await BlobStorageService.storeThumbnail(thumbnailBlob);

        if (currentDrawingId) {
          await vaultStore.updateDrawing(
            currentDrawingId,
            thumbnailId,
            canvasStore.background as any,
            layersToSave as any,
            canvasStore.activeLayerId,
            drawingName,
            canvasStore.page ? { ...canvasStore.page } : null,
          );
        } else {
          const newDrawing = await vaultStore.addDrawing(
            drawingName,
            thumbnailId,
            canvasStore.background as any,
            layersToSave as any,
            canvasStore.activeLayerId,
            canvasStore.page ? { ...canvasStore.page } : null,
          );
          if (newDrawing) {
            savedIdRef.current = newDrawing.id;
            setCurrentDrawingId(newDrawing.id);
            // Update the URL so refresh resumes editing this drawing instead of opening a blank canvas.
            if (
              typeof window !== "undefined" &&
              window.location.pathname === "/draw"
            ) {
              window.history.replaceState({}, "", `/draw/${newDrawing.id}`);
            }
          }
        }

        isDirtyRef.current = false;
        lastSavedRef.current = saved;
        return true;
      } catch (error) {
        console.error("Save failed:", error);
        return false;
      }
    };
    
    const performSaveRef = useRef(performSave);
    performSaveRef.current = performSave;

    const handleSave = async () => {
      // Cancel any pending autosave
      if (autosaveTimerRef.current !== null) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      setSaveStatus("saving");
      const success = await performSave();
      if (success) {
        setSaveStatus("saved");
        if (saveStatusResetTimerRef.current !== null) {
          clearTimeout(saveStatusResetTimerRef.current);
        }
        saveStatusResetTimerRef.current = window.setTimeout(() => {
          setSaveStatus("idle");
          saveStatusResetTimerRef.current = null;
        }, 2000);
      } else {
        setSaveStatus("idle");
      }
    };

    const handleSaveFile = async () => {
      if (autosaveTimerRef.current !== null) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const saved = await performSave();
      const id = savedIdRef.current;
      if (!saved || !id) {
        toast("Draw something first, then save it as a file");
        return;
      }
      try {
        await exportDrawings([id]);
      } catch (e) {
        console.error("Save as file failed:", e);
        toast.error("Couldn't save the file");
      }
    };

    // Rename drawing (without saving all content)
    const handleRename = async () => {
      if (currentDrawingId && drawingName.trim()) {
        await vaultStore.renameDrawing(currentDrawingId, drawingName.trim());
      }
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

    // Autosave: debounced reaction on renderVersion
    useEffect(() => {
      const disposer = reaction(
        () => canvasStore.renderVersion,
        () => {
          isDirtyRef.current = !canvasStore.isEmpty || !!savedIdRef.current;

          // Reset debounce timer
          if (autosaveTimerRef.current !== null) {
            clearTimeout(autosaveTimerRef.current);
          }

          const runAutosave = async () => {
            autosaveTimerRef.current = null;

            if (canvasStore.isInteracting) {
              autosaveTimerRef.current = window.setTimeout(
                runAutosave,
                AUTOSAVE_DEBOUNCE_MS,
              );
              return;
            }

            if (canvasStore.isEmpty && !savedIdRef.current) {
              isDirtyRef.current = false;
              return;
            }

            setSaveStatus("saving");
            const success = await performSaveRef.current();
            if (success) {
              setSaveStatus("saved");
              if (saveStatusResetTimerRef.current !== null) {
                clearTimeout(saveStatusResetTimerRef.current);
              }
              saveStatusResetTimerRef.current = window.setTimeout(() => {
                setSaveStatus("idle");
                saveStatusResetTimerRef.current = null;
              }, 1500);
            } else {
              setSaveStatus("idle");
            }
          };
          autosaveTimerRef.current = window.setTimeout(
            runAutosave,
            AUTOSAVE_DEBOUNCE_MS,
          );
        },
      );

      return () => {
        disposer();
        if (autosaveTimerRef.current !== null) {
          clearTimeout(autosaveTimerRef.current);
        }
        if (saveStatusResetTimerRef.current !== null) {
          clearTimeout(saveStatusResetTimerRef.current);
        }
      };
    }, []);

    // Warn user if closing with unsaved changes
    useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isDirtyRef.current) {
          e.preventDefault();
          e.returnValue = "";
        }
      };

      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }, []);

    const handleExport = async (format: ExportFormat) => {
      if (canvasStore.isEmpty) return;

      try {
        let dataUrl: string;
        const exportSize = { width: 1920, height: 1080 };
        // Get all strokes from visible layers for export
        const allStrokes = canvasStore.flattenedStrokes;
        // Get all layers for export (includes images)
        const exportLayers = canvasStore.exportLayers;
        const page = canvasStore.page;

        if (page && (format === "png" || format === "jpg")) {
          dataUrl = await ExportService.exportPage(
            exportLayers as any,
            { x: page.x, y: page.y, width: page.width, height: page.height },
            effectiveExportScale(settingsStore.exportSettings.scale, page),
            canvasStore.background as BackgroundType,
            format,
            settingsStore.exportSettings,
          );
          const name = `${drawingName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.${format}`;
          ExportService.downloadFile(dataUrl, name);
          return;
        }

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
        toast.error("Export failed. Please try again.");
      }
    };

    const handleShowExportDialog = () => {
      setShowExportDialog(true);
    };

    // Add keyboard shortcuts
    useKeyboardShortcuts(handleSave, handleShowExportDialog);

    const canvasLocked = animatingLayerId !== null;

    return (
      <StudioContext.Provider
        value={{
          onAnimationFrame: handleAnimationFrame,
          onAnimationStateChange: handleAnimationStateChange,
        }}
      >
        <StudioShell
          onFit={() => fitView(canvasStore)}
          topLeft={
            <TopLeftBlock
              drawingName={drawingName}
              onNameChange={setDrawingName}
              onNameCommit={() => handleRename()}
              saveStatus={saveStatus}
              onBack={onBackToVault}
              onImport={() => setShowImportDialog(true)}
              onExport={handleShowExportDialog}
              onSaveFile={handleSaveFile}
              onOpenSettings={() => setShowSettings(true)}
              onPageSize={() => setShowPageSize(true)}
            />
          }
          topRight={<TopRightBlock onShare={handleShowExportDialog} onClear={handleClear} />}
        >
          <DrawingCanvas
            isDrawingMode={isDrawingMode}
            animatingLayerId={animatingLayerId}
            animationFrame={animationFrame}
            canvasLocked={canvasLocked}
          />
          {canvasLocked && (
            <div className="pointer-events-none absolute top-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-[4px] bg-zk-surface px-3 py-1.5 text-[12px] text-zk-text">
              <LockIcon className="h-3 w-3 text-zk-accent" />
              Animation playing — stop it to edit
            </div>
          )}
        </StudioShell>

        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--zk-scrim-alert)">
            <div role="alertdialog" aria-labelledby="clear-title" className="w-[340px] rounded-[6px] bg-zk-surface p-6 text-zk-text shadow-(--zk-shadow-alert)">
              <h3 id="clear-title" className="mb-3 font-display text-2xl font-semibold">
                Clear the canvas?
              </h3>
              <p className="mb-6 text-[13px] leading-relaxed text-zk-text-2">
                This deletes <strong className="text-zk-text">all layers and strokes</strong> and
                starts a fresh empty layer. It can&apos;t be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={cancelClear}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmClear}>
                  Clear all
                </Button>
              </div>
            </div>
          </div>
        )}

        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          onExport={handleExport}
          strokes={canvasStore.flattenedStrokes as any}
          background={canvasStore.background as BackgroundType}
          drawingName={drawingName}
          drawingId={currentDrawingId}
          layerCount={canvasStore.layerCount}
          onFlattenLayers={() => canvasStore.flattenAllLayers()}
          layers={canvasStore.exportLayers as any}
          page={canvasStore.page ? { ...canvasStore.page } : null}
          focusedLayerName={canvasStore.isFocusMode ? (canvasStore.visibleLayers[0]?.name ?? null) : null}
        />

        {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}

        {canvasStore.page && (
          <PageSizeDialog
            open={showPageSize}
            onOpenChange={setShowPageSize}
            page={{ ...canvasStore.page }}
            onApply={(width, height) => {
              const p = canvasStore.page;
              if (!p) return;
              canvasStore.setPage(resizePage({ x: p.x, y: p.y, width: p.width, height: p.height }, width, height));
              requestAnimationFrame(() => {
                fitView(canvasStore);
              });
            }}
          />
        )}

        <ImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          canvasWidth={1920}
          canvasHeight={1080}
        />
      </StudioContext.Provider>
    );
  },
);

export default CanvasView;
