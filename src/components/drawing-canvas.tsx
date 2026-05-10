import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { getSnapshot } from "mobx-state-tree";
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
import type { IPoint } from "@/models/CanvasModel";
import { CanvasEngine, transformController, InputManager } from "@/engine";
import type {
  StrokeLike,
  TransformHandleType,
  ShapeElementLike,
  TransformableLayer,
} from "@/engine";
import type { TransformStartState } from "@/engine/TransformController";
import { createGetBrushOptions } from "@/engine/brushOptions";
import { ImportService } from "@/services/ImportService";
import { toast } from "sonner";

interface DrawingCanvasProps {
  isDrawingMode: boolean;
  className?: string;
  width?: number;
  height?: number;
  animatingLayerId?: string | null;
  animationStrokes?: StrokeLike[] | null;
  canvasLocked?: boolean;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = observer(
  ({
    isDrawingMode,
    className,
    width,
    height,
    animatingLayerId,
    animationStrokes,
    canvasLocked = false,
  }) => {
    const canvasStore = useCanvasStore();
    const settingsStore = useSettingsStore();
    // We now mount canvases inside this root div via CanvasEngine; no direct canvas ref needed
    const rootRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<CanvasEngine | null>(null);
    const inputManagerRef = useRef<InputManager | null>(null);
    // Wheel axis lock to keep horizontal pan during momentum even after Shift released
    const wheelAxisLockRef = useRef<"none" | "horizontal" | "vertical">("none");
    const wheelAxisResetTimerRef = useRef<number | null>(null);
    const shiftDownRef = useRef(false);
    const lastShiftUpTsRef = useRef<number>(0);
    const prevIsDrawingRef = useRef(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<IPoint[]>([]);
    const [spacePressed, setSpacePressed] = useState(false);
    const [mousePosition, setMousePosition] = useState<{
      x: number;
      y: number;
    } | null>(null);

    // Transform interaction state
    const [isTransforming, setIsTransforming] = useState(false);
    const [transformHandle, setTransformHandle] =
      useState<TransformHandleType | null>(null);
    const [transformStart, setTransformStart] =
      useState<TransformStartState | null>(null);

    // Stroke timing for animation playback
    const strokeStartTimeRef = useRef<number | null>(null);
    // Distinguishes a real draw from onDrawStart that early-returned (image select / transform).
    const drawingStartedRef = useRef(false);
    // Active shape creation drag (start + current canvas-space coords).
    const shapeCreationRef = useRef<{
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    } | null>(null);
    const marqueeRef = useRef<{
      startX: number;
      startY: number;
      curX: number;
      curY: number;
      additive: boolean;
    } | null>(null);
    const groupDragRef = useRef<{
      lastX: number;
      lastY: number;
      hasMoved: boolean;
    } | null>(null);
    // InputManager is mounted once; route live values via refs so its closures stay current.
    const isDrawingModeRef = useRef(isDrawingMode);
    useEffect(() => {
      isDrawingModeRef.current = isDrawingMode;
    }, [isDrawingMode]);

    // Mount layered engine (background + strokes). Engine handles its own resizing.
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const engine = new CanvasEngine(root, {
        background: canvasStore.background as any,
        getStrokes: () => canvasStore.strokes as unknown as StrokeLike[],
        // Provide layers for multi-layer rendering - use snapshots to avoid MST detachment issues
        getLayers: () => {
          try {
            return canvasStore.visibleLayers.map((layer) => {
              const snapshot = getSnapshot(layer) as any;
              const baseLayer = {
                id: snapshot.id,
                name: snapshot.name,
                type: snapshot.type,
                visible: snapshot.visible,
                locked: snapshot.locked,
                opacity: snapshot.opacity,
              };

              if (snapshot.type === "image") {
                return {
                  ...baseLayer,
                  blobId: snapshot.blobId,
                  naturalWidth: snapshot.naturalWidth,
                  naturalHeight: snapshot.naturalHeight,
                  x: snapshot.x,
                  y: snapshot.y,
                  width: snapshot.width,
                  height: snapshot.height,
                  rotation: snapshot.rotation,
                  aspectLocked: snapshot.aspectLocked,
                };
              }

              // Draw layer (default)
              return {
                ...baseLayer,
                elements: snapshot.elements || [],
              };
            }) as any;
          } catch (e) {
            console.warn("getLayers: layer access error", e);
            return [];
          }
        },
        getActiveLayerId: () => canvasStore.activeLayerId,
        getSelectedLayerId: () => canvasStore.selectedLayerId,
        getSelectedElementId: () => canvasStore.selectedElementId,
        getSelectedElements: () =>
          canvasStore.selectedElements.map((s) => ({
            layerId: s.layerId,
            elementId: s.elementId,
          })),
        // Use a dynamic brush options builder bound to the latest settings
        getBrushOptions: (brush, size) =>
          createGetBrushOptions(canvasStore.brushSettings as any)(
            brush as any,
            size,
          ),
      });
      engine.setPanZoom({
        panX: canvasStore.panX,
        panY: canvasStore.panY,
        zoom: canvasStore.zoom,
      });
      engineRef.current = engine;
      return () => {
        engine.destroy();
        engineRef.current = null;
      };
    }, []);

    // Sync background with engine
    useEffect(() => {
      engineRef.current?.setBackground(canvasStore.background as any);
      engineRef.current?.invalidate();
    }, [canvasStore.background]);

    // Sync pan/zoom with engine
    useEffect(() => {
      engineRef.current?.setPanZoom({
        panX: canvasStore.panX,
        panY: canvasStore.panY,
        zoom: canvasStore.zoom,
      });
    }, [canvasStore.panX, canvasStore.panY, canvasStore.zoom]);

    // Force repaint on history/state changes (undo/redo/clear, etc.)
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      // Clear any preview in case undo/redo occurred mid-stroke
      engine.setPreviewStroke(null);
      engine.invalidate();
    }, [canvasStore.renderVersion]);

    // Sync animation state with engine
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.setAnimationState(
        animatingLayerId ?? null,
        animationStrokes ?? null,
      );
    }, [animatingLayerId, animationStrokes]);

    // Coordinate conversion
    const screenToCanvas = useCallback(
      (clientX: number, clientY: number): IPoint => {
        const root = rootRef.current;
        if (!root) return { x: 0, y: 0, pressure: 0.5 };
        const rect = root.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        // screen = zoom * world + pan  =>  world = (screen - pan) / zoom
        const x = (localX - canvasStore.panX) / canvasStore.zoom;
        const y = (localY - canvasStore.panY) / canvasStore.zoom;
        return { x, y, pressure: 0.5 };
      },
      [canvasStore.panX, canvasStore.panY, canvasStore.zoom],
    );

    // Hit test selectable things — returns the topmost image layer OR shape element under the point.
    // For image hits: { layerId }. For shape hits: { layerId, elementId }.
    const hitTestSelectableLayers = useCallback(
      (
        canvasX: number,
        canvasY: number,
      ): { layerId: string; elementId: string | null } | null => {
        const layers = canvasStore.visibleLayers;
        for (let i = layers.length - 1; i >= 0; i--) {
          const layer = layers[i];
          if (layer.locked) continue;

          if (layer.type === "image") {
            const t = layer as any;
            if (
              canvasX >= t.x &&
              canvasX <= t.x + t.width &&
              canvasY >= t.y &&
              canvasY <= t.y + t.height
            ) {
              return { layerId: layer.id, elementId: null };
            }
            continue;
          }

          if (layer.type === "draw") {
            const elements = (layer as any).elements;
            // Iterate top-down within the layer's elements; shapes render on top of strokes,
            // so we hit-test shapes first (in reverse order so the topmost shape wins).
            for (let j = elements.length - 1; j >= 0; j--) {
              const el = elements[j];
              if (!el || !("shapeType" in el)) continue;
              if (
                canvasX >= el.x &&
                canvasX <= el.x + el.width &&
                canvasY >= el.y &&
                canvasY <= el.y + el.height
              ) {
                return { layerId: layer.id, elementId: el.id };
              }
            }
          }
        }
        return null;
      },
      [canvasStore.visibleLayers],
    );

    const hitTestTransformHandles = useCallback(
      (screenX: number, screenY: number): TransformHandleType | null => {
        const selectedLayer = canvasStore.selectedTransformableLayer as any;
        if (!selectedLayer) return null;

        const root = rootRef.current;
        if (!root) return null;
        const rect = root.getBoundingClientRect();
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;

        const viewport = {
          panX: canvasStore.panX,
          panY: canvasStore.panY,
          zoom: canvasStore.zoom,
        };

        // Match the visual padding used by the engine (8px screen + half stroke for shapes).
        const gapWorld = 8 / canvasStore.zoom;
        const pad =
          "shapeType" in selectedLayer
            ? (selectedLayer.strokeWidth ?? 0) / 2 + gapWorld
            : gapWorld;

        return transformController.hitTest(
          { x: localX, y: localY },
          selectedLayer as TransformableLayer,
          viewport,
          pad,
        );
      },
      [
        canvasStore.selectedTransformableLayer,
        canvasStore.zoom,
        canvasStore.panX,
        canvasStore.panY,
      ],
    );

    // Preview RAF coalescing
    const previewRafRef = useRef<number | null>(null);

    const renderStrokes = useCallback(() => {
      const engine = engineRef.current;
      if (!engine) return;
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = requestAnimationFrame(() => {
        if (!engineRef.current) return;
        if (currentPoints.length > 1) {
          const temp: StrokeLike = {
            id: "temp",
            points: currentPoints.map((p) => ({
              x: p.x,
              y: p.y,
              pressure: p.pressure,
            })),
            color: canvasStore.currentColor,
            size:
              canvasStore.currentBrushStyle === "eraser"
                ? canvasStore.eraserSize
                : canvasStore.currentSize,
            opacity: canvasStore.brushSettings.opacity ?? 1,
            brushStyle: canvasStore.currentBrushStyle as any,
            timestamp: Date.now(),
            // Include brush settings for accurate preview rendering
            thinning: canvasStore.brushSettings.thinning,
            smoothing: canvasStore.brushSettings.smoothing,
            streamline: canvasStore.brushSettings.streamline,
            taperStart: canvasStore.brushSettings.taperStart,
            taperEnd: canvasStore.brushSettings.taperEnd,
          };
          engineRef.current.setPreviewStroke(temp);
        } else {
          engineRef.current.setPreviewStroke(null);
        }
        engineRef.current.invalidate();
        previewRafRef.current = null;
      });
    }, [
      engineRef.current,
      currentPoints,
      canvasStore.currentBrushStyle,
      canvasStore.currentColor,
      canvasStore.currentSize,
      canvasStore.eraserSize,
      canvasStore.brushSettings.opacity,
    ]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          setSpacePressed(true);
          inputManagerRef.current?.setPanOverride(true);
        }
        if (e.key === "Shift") {
          shiftDownRef.current = true;
        }
        if (e.key === "Escape") {
          if (canvasStore.isTransformMode) {
            e.preventDefault();
            canvasStore.deselectLayer();
          } else if (
            canvasStore.activeTool === "shape" ||
            canvasStore.activeTool === "select"
          ) {
            e.preventDefault();
            canvasStore.setActiveTool("brush");
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          e.preventDefault();
          setSpacePressed(false);
          inputManagerRef.current?.setPanOverride(false);
        }
        if (e.key === "Shift") {
          shiftDownRef.current = false;
          lastShiftUpTsRef.current = performance.now();
        }
      };

      // Prevent browser zoom/scroll if the pointer is over the canvas area
      const handleGlobalWheel = (e: WheelEvent) => {
        const root = rootRef.current;
        if (!root) return;
        const target = e.target as Node | null;
        const inside = !!target && (target === root || root.contains(target));
        if (!inside) return;
        if (e.ctrlKey) {
          e.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("wheel", handleGlobalWheel, {
        passive: false,
        capture: true,
      });

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("wheel", handleGlobalWheel, true);
      };
    }, []);

    const handleWheel = useCallback(
      (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // mouse wheel event handling for panning and zooming.

        if (e.ctrlKey) {
          // Zooming branch (supports pinch zoom because browsers synthesize ctrlKey)
          const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
          const newZoom = Math.max(
            0.1,
            Math.min(5, canvasStore.zoom * zoomFactor),
          );
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - canvasStore.panX) / canvasStore.zoom;
            const worldY = (mouseY - canvasStore.panY) / canvasStore.zoom;
            const newPanX = mouseX - worldX * newZoom;
            const newPanY = mouseY - worldY * newZoom;
            canvasStore.setZoom(newZoom);
            canvasStore.setPan(newPanX, newPanY);
          }
          return;
        }

        // Panning branch
        const recentlyShifted =
          performance.now() - lastShiftUpTsRef.current < 600;
        const horizontalPanActive =
          e.shiftKey || shiftDownRef.current || recentlyShifted;

        // Maintain axis lock for momentum (reuse existing timers if we want extended behavior)
        if (horizontalPanActive) {
          wheelAxisLockRef.current = "horizontal";
          if (wheelAxisResetTimerRef.current) {
            window.clearTimeout(wheelAxisResetTimerRef.current);
          }
          wheelAxisResetTimerRef.current = window.setTimeout(() => {
            wheelAxisLockRef.current = "none";
            wheelAxisResetTimerRef.current = null;
          }, 600);
        }

        if (wheelAxisLockRef.current === "horizontal") {
          // Horizontal pan: use deltaY to move X (natural feel: scroll down moves right => subtract)
          canvasStore.setPan(
            canvasStore.panX - e.deltaY * 0.5,
            canvasStore.panY,
          );
        } else {
          // Vertical + incidental horizontal from trackpads: prioritize vertical scroll for panY
          // Use deltaX for sideways pan only if present (trackpad gesture)
          const nextPanX = canvasStore.panX - e.deltaX * 0.5;
          const nextPanY = canvasStore.panY - e.deltaY * 0.5;
          canvasStore.setPan(nextPanX, nextPanY);
        }
      },
      [canvasStore],
    );

    // Attach wheel event with passive: false to allow preventDefault
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      root.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        root.removeEventListener("wheel", handleWheel);
      };
    }, [handleWheel]);

    // Mount InputManager for touch/stylus input handling
    // Note: callbacks start empty and are wired in the next effect (same React commit).
    // No user events can fire between effects since JS is single-threaded.
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const manager = new InputManager(root, {
        getTouchMode: () => settingsStore.touchMode as "auto" | "stylus-only" | "touch-draw",
        getIsDrawingMode: () => isDrawingModeRef.current,
        callbacks: {},
      });

      inputManagerRef.current = manager;

      return () => {
        manager.destroy();
        inputManagerRef.current = null;
      };
    }, []);

    // Update InputManager callbacks when dependencies change
    useEffect(() => {
      const manager = inputManagerRef.current;
      if (!manager) return;

      manager.setCallbacks({
        onDrawStart: (pt, pointerType) => {
          if (canvasLocked) return;
          const root = rootRef.current;
          if (!root) return;

          const canvasPoint = screenToCanvas(pt.x, pt.y);
          canvasPoint.pressure = pt.pressure;

          if (canvasStore.activeTool === "select") {
            // Resize / rotate handles only meaningful when exactly one element is selected.
            if (
              canvasStore.selectionCount === 1 &&
              canvasStore.selectedTransformableLayer
            ) {
              const handle = hitTestTransformHandles(pt.x, pt.y);
              if (handle && handle !== "move") {
                const rect = root.getBoundingClientRect();
                const localX = pt.x - rect.left;
                const localY = pt.y - rect.top;
                const viewport = {
                  panX: canvasStore.panX,
                  panY: canvasStore.panY,
                  zoom: canvasStore.zoom,
                };
                const startState = transformController.captureStartState(
                  { x: localX, y: localY },
                  canvasStore.selectedTransformableLayer as TransformableLayer,
                  viewport,
                );
                setIsTransforming(true);
                setTransformHandle(handle);
                setTransformStart(startState);
                return;
              }
            }

            const hit = hitTestSelectableLayers(canvasPoint.x, canvasPoint.y);
            const shift = shiftDownRef.current;
            if (hit) {
              if (shift) {
                canvasStore.toggleSelection(hit.layerId, hit.elementId);
                return;
              }
              const alreadySelected = canvasStore.isSelected(
                hit.layerId,
                hit.elementId,
              );
              if (!alreadySelected) {
                if (hit.elementId) {
                  canvasStore.selectElement(hit.layerId, hit.elementId);
                } else {
                  canvasStore.selectLayer(hit.layerId);
                }
              }
              groupDragRef.current = {
                lastX: canvasPoint.x,
                lastY: canvasPoint.y,
                hasMoved: false,
              };
              drawingStartedRef.current = true;
              return;
            }

            // Empty space: start a marquee. Plain click without drag will deselect on release.
            if (!shift && canvasStore.hasSelection) {
              canvasStore.deselectLayer();
            }
            marqueeRef.current = {
              startX: canvasPoint.x,
              startY: canvasPoint.y,
              curX: canvasPoint.x,
              curY: canvasPoint.y,
              additive: shift,
            };
            drawingStartedRef.current = true;
            return;
          }

          if (canvasStore.activeTool === "shape") {
            shapeCreationRef.current = {
              startX: canvasPoint.x,
              startY: canvasPoint.y,
              curX: canvasPoint.x,
              curY: canvasPoint.y,
            };
            drawingStartedRef.current = true;
            return;
          }

          strokeStartTimeRef.current = Date.now();
          drawingStartedRef.current = true;
          setIsDrawing(true);
          setCurrentPoints([canvasPoint]);
        },

        onDrawMove: (pt) => {
          if (!drawingStartedRef.current) return;
          const canvasPoint = screenToCanvas(pt.x, pt.y);
          canvasPoint.pressure = pt.pressure;

          if (groupDragRef.current) {
            const dx = canvasPoint.x - groupDragRef.current.lastX;
            const dy = canvasPoint.y - groupDragRef.current.lastY;
            if (dx !== 0 || dy !== 0) {
              canvasStore.moveSelectedBy(dx, dy);
              groupDragRef.current.lastX = canvasPoint.x;
              groupDragRef.current.lastY = canvasPoint.y;
              groupDragRef.current.hasMoved = true;
            }
            return;
          }

          if (marqueeRef.current) {
            marqueeRef.current.curX = canvasPoint.x;
            marqueeRef.current.curY = canvasPoint.y;
            const m = marqueeRef.current;
            engineRef.current?.setMarquee({
              x: Math.min(m.startX, m.curX),
              y: Math.min(m.startY, m.curY),
              width: Math.abs(m.curX - m.startX),
              height: Math.abs(m.curY - m.startY),
            });
            return;
          }

          if (shapeCreationRef.current) {
            const start = shapeCreationRef.current;
            let curX = canvasPoint.x;
            let curY = canvasPoint.y;
            if (shiftDownRef.current) {
              const dx = curX - start.startX;
              const dy = curY - start.startY;
              const size = Math.max(Math.abs(dx), Math.abs(dy));
              curX = start.startX + (dx >= 0 ? size : -size);
              curY = start.startY + (dy >= 0 ? size : -size);
            }
            shapeCreationRef.current = { ...start, curX, curY };

            const x = Math.min(start.startX, curX);
            const y = Math.min(start.startY, curY);
            const w = Math.max(1, Math.abs(curX - start.startX));
            const h = Math.max(1, Math.abs(curY - start.startY));

            const previewShape: ShapeElementLike = {
              id: "preview",
              opacity: canvasStore.shapeOpacity,
              shapeType: canvasStore.currentShapeType as any,
              x,
              y,
              width: w,
              height: h,
              rotation: 0,
              strokeColor: canvasStore.currentColor,
              strokeWidth: canvasStore.shapeStrokeWidth,
              cornerRadius: canvasStore.shapeCornerRadius,
              fillColor: canvasStore.shapeFillColor,
            };
            engineRef.current?.setPreviewShape(previewShape);
            return;
          }

          // While erasing, also delete shapes the eraser passes over (active layer only).
          if (canvasStore.currentBrushStyle === "eraser") {
            const eraserR = canvasStore.eraserSize / 2;
            const activeLayer = canvasStore.activeLayer as any;
            if (activeLayer && activeLayer.type === "draw" && !activeLayer.locked) {
              const elements = activeLayer.elements;
              for (let j = elements.length - 1; j >= 0; j--) {
                const el = elements[j];
                if (!el || !("shapeType" in el)) continue;
                // AABB-vs-circle: nearest point on box clamped to eraser center.
                const nx = Math.max(el.x, Math.min(canvasPoint.x, el.x + el.width));
                const ny = Math.max(el.y, Math.min(canvasPoint.y, el.y + el.height));
                const ddx = canvasPoint.x - nx;
                const ddy = canvasPoint.y - ny;
                if (ddx * ddx + ddy * ddy <= eraserR * eraserR) {
                  canvasStore.removeElement(activeLayer.id, el.id);
                }
              }
            }
          }

          // Min-distance filter
          const MIN_DIST = 0.5;
          setCurrentPoints((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return [canvasPoint];
            const dx = canvasPoint.x - last.x;
            const dy = canvasPoint.y - last.y;
            if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return prev;
            return [...prev, canvasPoint];
          });
        },

        onDrawEnd: () => {
          drawingStartedRef.current = false;

          if (groupDragRef.current) {
            if (groupDragRef.current.hasMoved) {
              canvasStore.saveCurrentStateToHistory();
            }
            groupDragRef.current = null;
            return;
          }

          if (marqueeRef.current) {
            const m = marqueeRef.current;
            engineRef.current?.setMarquee(null);
            const w = Math.abs(m.curX - m.startX);
            const h = Math.abs(m.curY - m.startY);
            if (w > 3 || h > 3) {
              canvasStore.selectInBounds(
                {
                  x: Math.min(m.startX, m.curX),
                  y: Math.min(m.startY, m.curY),
                  width: w,
                  height: h,
                },
                m.additive,
              );
            }
            marqueeRef.current = null;
            return;
          }

          if (shapeCreationRef.current) {
            const ref = shapeCreationRef.current;
            shapeCreationRef.current = null;
            engineRef.current?.setPreviewShape(null);

            const dx = ref.curX - ref.startX;
            const dy = ref.curY - ref.startY;
            const MIN_DRAG = 5;
            if (Math.hypot(dx, dy) >= MIN_DRAG) {
              const x = Math.min(ref.startX, ref.curX);
              const y = Math.min(ref.startY, ref.curY);
              const w = Math.abs(dx);
              const h = Math.abs(dy);
              const created = canvasStore.addShape(
                canvasStore.currentShapeType as any,
                x,
                y,
                w,
                h,
              );
              if (created) {
                // Hand off to the Select tool so the user can immediately transform the new shape.
                canvasStore.setActiveTool("select");
                canvasStore.selectElement(created.layerId, created.elementId);
              }
            }
            return;
          }

          setIsDrawing(false);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
        },

        onDrawCancel: () => {
          drawingStartedRef.current = false;
          if (groupDragRef.current) {
            groupDragRef.current = null;
          }
          if (marqueeRef.current) {
            marqueeRef.current = null;
            engineRef.current?.setMarquee(null);
          }
          if (shapeCreationRef.current) {
            shapeCreationRef.current = null;
            engineRef.current?.setPreviewShape(null);
            engineRef.current?.invalidate();
            return;
          }
          setIsDrawing(false);
          setCurrentPoints([]);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
          engineRef.current?.setPreviewStroke(null);
          engineRef.current?.invalidate();
        },

        onGestureStart: () => {
          // Nothing special needed on gesture start
        },

        onGestureUpdate: (gesture) => {
          const root = rootRef.current;
          if (!root) return;

          // Capture current pan/zoom before mutation
          const curPanX = canvasStore.panX;
          const curPanY = canvasStore.panY;
          const curZoom = canvasStore.zoom;

          if (gesture.zoomDelta !== 1) {
            // Combined pan + zoom: compute new zoom and pan atomically
            const rect = root.getBoundingClientRect();
            const localX = gesture.zoomCenterX - rect.left;
            const localY = gesture.zoomCenterY - rect.top;

            const newZoom = Math.max(0.1, Math.min(5, curZoom * gesture.zoomDelta));
            const worldX = (localX - curPanX) / curZoom;
            const worldY = (localY - curPanY) / curZoom;
            const newPanX = localX - worldX * newZoom + gesture.panDeltaX;
            const newPanY = localY - worldY * newZoom + gesture.panDeltaY;

            canvasStore.setZoom(newZoom);
            canvasStore.setPan(newPanX, newPanY);
          } else {
            // Pure pan (no zoom)
            canvasStore.setPan(
              curPanX + gesture.panDeltaX,
              curPanY + gesture.panDeltaY,
            );
          }
        },

        onGestureEnd: () => {
          // Nothing special needed
        },

        onHoverMove: (screenX, screenY) => {
          setMousePosition({ x: screenX, y: screenY });
        },
      });
    }, [
      screenToCanvas,
      isDrawingMode,
      hitTestSelectableLayers,
      hitTestTransformHandles,
      canvasStore,
      canvasLocked,
    ]);

    // Commit stroke when drawing ends
    useEffect(() => {
      // Detect transition from drawing -> not drawing
      if (prevIsDrawingRef.current && !isDrawing && currentPoints.length > 1) {
        const endTime = Date.now();
        const startTime = strokeStartTimeRef.current ?? endTime;
        const duration = endTime - startTime;
        strokeStartTimeRef.current = null;

        const strokeData = {
          id: crypto.randomUUID(),
          points: currentPoints.map((point) => ({ ...point })),
          color: canvasStore.currentColor,
          size:
            canvasStore.currentBrushStyle === "eraser"
              ? canvasStore.eraserSize
              : canvasStore.currentSize,
          opacity: canvasStore.brushSettings.opacity ?? 1,
          brushStyle: canvasStore.currentBrushStyle,
          timestamp: endTime,
          startTime,
          duration,
          thinning: canvasStore.brushSettings.thinning,
          smoothing: canvasStore.brushSettings.smoothing,
          streamline: canvasStore.brushSettings.streamline,
          taperStart: canvasStore.brushSettings.taperStart,
          taperEnd: canvasStore.brushSettings.taperEnd,
        };

        if (canvasStore.hasLayers) {
          canvasStore.addStrokeToActiveLayer(strokeData);
        } else {
          canvasStore.addStroke(strokeData);
        }

        setCurrentPoints([]);
        engineRef.current?.setPreviewStroke(null);
        engineRef.current?.invalidate();
      }
      prevIsDrawingRef.current = isDrawing;
    }, [isDrawing, currentPoints, canvasStore]);

    // Handle clipboard paste for image import
    const handleImagePaste = useCallback(
      async (file: File) => {
        if (canvasLocked) {
          toast.error("Stop animation playback to paste images");
          return false;
        }
        try {
          const result = await ImportService.importFromFile(file);

          if (
            result.success &&
            result.blobId &&
            result.width &&
            result.height
          ) {
            // Get canvas dimensions for sizing
            const root = rootRef.current;
            const canvasWidth = root?.clientWidth || 1920;
            const canvasHeight = root?.clientHeight || 1080;

            // Convert mouse position to canvas coordinates if available
            let centerX: number | undefined;
            let centerY: number | undefined;

            if (mousePosition && root) {
              const rect = root.getBoundingClientRect();
              const localX = mousePosition.x - rect.left;
              const localY = mousePosition.y - rect.top;
              // Convert screen coords to world coords
              centerX = (localX - canvasStore.panX) / canvasStore.zoom;
              centerY = (localY - canvasStore.panY) / canvasStore.zoom;
            }

            canvasStore.addImageLayer(
              result.blobId,
              result.originalWidth || result.width,
              result.originalHeight || result.height,
              canvasWidth,
              canvasHeight,
              "Pasted Image",
              centerX,
              centerY,
            );

            toast.success("Image pasted successfully!");
            return true;
          } else {
            toast.error(result.error || "Failed to paste image");
            return false;
          }
        } catch (error) {
          console.error("Paste import failed:", error);
          toast.error("Failed to paste image");
          return false;
        }
      },
      [canvasStore, mousePosition, canvasLocked],
    );

    useEffect(() => {
      const handlePaste = async (e: ClipboardEvent) => {
        if (!e.clipboardData) {
          return;
        }

        // Look for image items in clipboard
        const items = Array.from(e.clipboardData.items);
        const imageItem = items.find((item) => item.type.startsWith("image/"));

        if (!imageItem) {
          return;
        }

        const file = imageItem.getAsFile();
        if (!file) {
          return;
        }

        e.preventDefault();
        await handleImagePaste(file);
      };

      // Handle Ctrl+V/Cmd+V using Clipboard API (more reliable)
      const handleKeyDown = async (e: KeyboardEvent) => {
        // Check for Ctrl+V or Cmd+V
        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
          // Don't handle if in an input/textarea
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          ) {
            return;
          }

          // Use Clipboard API to read images
          try {
            if (navigator.clipboard && navigator.clipboard.read) {
              const clipboardItems = await navigator.clipboard.read();
              for (const clipboardItem of clipboardItems) {
                const imageType = clipboardItem.types.find((type) =>
                  type.startsWith("image/"),
                );
                if (imageType) {
                  const blob = await clipboardItem.getType(imageType);
                  const file = new File([blob], "pasted-image", {
                    type: imageType,
                  });

                  const success = await handleImagePaste(file);
                  if (success) {
                    e.preventDefault();
                  }
                  return;
                }
              }
            }
          } catch (err) {
            // Clipboard API might fail due to permissions, fall through to paste event
          }
        }
      };

      // Listen on window for paste events and keydown
      window.addEventListener("paste", handlePaste);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("paste", handlePaste);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [canvasStore, handleImagePaste]);

    useEffect(() => {
      renderStrokes();
    }, [renderStrokes]);

    // Handle transform pointer moves (image/shape layer move/resize/rotate)
    const handleTransformMove = useCallback(
      (e: React.PointerEvent) => {
        if (
          !isTransforming ||
          !transformHandle ||
          !transformStart ||
          !canvasStore.selectedTransformableLayer
        )
          return;

        const layer = canvasStore.selectedTransformableLayer as any;
        const root = rootRef.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;

        const viewport = {
          panX: canvasStore.panX,
          panY: canvasStore.panY,
          zoom: canvasStore.zoom,
        };

        let result;
        if (transformHandle === "move") {
          result = transformController.applyMove(
            { x: localX, y: localY },
            transformStart,
            viewport,
          );
          layer.setPosition(result.x, result.y);
        } else if (transformHandle === "rotate") {
          result = transformController.applyRotation(
            { x: localX, y: localY },
            transformStart,
            viewport,
          );
          layer.setRotation(result.rotation);
        } else if (["nw", "ne", "se", "sw"].includes(transformHandle)) {
          const maintainAspect = !e.shiftKey;
          result = transformController.applyResize(
            transformHandle as "nw" | "ne" | "se" | "sw",
            { x: localX, y: localY },
            transformStart,
            viewport,
            maintainAspect,
          );
          layer.setPosition(result.x, result.y);
          layer.setSize(result.width, result.height, false);
        }
      },
      [isTransforming, transformHandle, transformStart, canvasStore],
    );

    const handleTransformUp = useCallback(
      (_e: React.PointerEvent) => {
        if (!isTransforming) return;
        setIsTransforming(false);
        setTransformHandle(null);
        setTransformStart(null);
        canvasStore.saveCurrentStateToHistory();
      },
      [isTransforming, canvasStore],
    );

    const getCursorStyle = () => {
      if (canvasLocked) return "cursor-not-allowed";
      if (spacePressed) return "cursor-grabbing";
      if (!isDrawingMode) return "cursor-grab";

      // Transform mode cursors
      if (isTransforming) {
        if (transformHandle === "move") return "cursor-move";
        if (transformHandle === "rotate") return "cursor-alias";
        if (transformHandle === "nw" || transformHandle === "se")
          return "cursor-nwse-resize";
        if (transformHandle === "ne" || transformHandle === "sw")
          return "cursor-nesw-resize";
      }

      // Check if hovering over transform handles
      if (canvasStore.isTransformMode && mousePosition) {
        const handle = hitTestTransformHandles(
          mousePosition.x,
          mousePosition.y,
        );
        if (handle === "move") return "cursor-move";
        if (handle === "rotate") return "cursor-alias";
        if (handle === "nw" || handle === "se") return "cursor-nwse-resize";
        if (handle === "ne" || handle === "sw") return "cursor-nesw-resize";
      }

      if (canvasStore.activeTool === "select") return "cursor-default";
      // Eraser cursor is only hidden while the brush tool is actually using the eraser.
      if (
        canvasStore.activeTool === "brush" &&
        canvasStore.currentBrushStyle === "eraser"
      )
        return "cursor-none";
      return "cursor-crosshair";
    };

    // Update overlay eraser cursor on pointer moves and state changes
    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const root = rootRef.current;
      if (!root) return;
      if (
        mousePosition &&
        isDrawingMode &&
        canvasStore.activeTool === "brush" &&
        canvasStore.currentBrushStyle === "eraser" &&
        !spacePressed &&
        !canvasLocked
      ) {
        const rect = root.getBoundingClientRect();
        engine.setCursor({
          visible: true,
          x: mousePosition.x - rect.left,
          y: mousePosition.y - rect.top,
          r: (canvasStore.eraserSize * canvasStore.zoom) / 2,
        });
      } else {
        engine.setCursor({ visible: false });
      }
    }, [
      mousePosition,
      isDrawingMode,
      canvasStore.activeTool,
      canvasStore.currentBrushStyle,
      canvasStore.eraserSize,
      canvasStore.zoom,
      spacePressed,
      canvasLocked,
    ]);

    return (
      <div
        ref={rootRef}
        className={`fixed inset-0 touch-none ${getCursorStyle()} ${className}`}
        tabIndex={0}
        onPointerMove={isTransforming ? handleTransformMove : undefined}
        onPointerUp={isTransforming ? handleTransformUp : undefined}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          outline: "none",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitTapHighlightColor: "transparent",
          position: "fixed",
          inset: 0,
          msContentZooming: "none",
          overscrollBehavior: "none",
          KhtmlUserSelect: "none",
          zIndex: 0,
        }}
      />
    );
  },
);

export default DrawingCanvas;
