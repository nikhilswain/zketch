import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { getSnapshot } from "mobx-state-tree";
import { useCanvasStore } from "../hooks/useStores";
import type { IPoint, IStroke } from "@/models/CanvasModel";
import { CanvasEngine, transformController } from "@/engine";
import type {
  StrokeLike,
  LayerLike,
  TransformHandleType,
  ImageLayerLike,
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
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = observer(
  ({ isDrawingMode, className, width, height }) => {
    const canvasStore = useCanvasStore();
    // We now mount canvases inside this root div via CanvasEngine; no direct canvas ref needed
    const rootRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<CanvasEngine | null>(null);
    // Wheel axis lock to keep horizontal pan during momentum even after Shift released
    const wheelAxisLockRef = useRef<"none" | "horizontal" | "vertical">("none");
    const wheelAxisResetTimerRef = useRef<number | null>(null);
    const shiftDownRef = useRef(false);
    const lastShiftUpTsRef = useRef<number>(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<IPoint[]>([]);
    const [lastPanPoint, setLastPanPoint] = useState<{
      x: number;
      y: number;
    } | null>(null);
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
            // Use visibleLayers which respects focus mode
            return canvasStore.visibleLayers.map((layer) => {
              const snapshot = getSnapshot(layer) as any;
              const layerType = snapshot.type || "stroke";

              // Base layer properties
              const baseLayer = {
                id: snapshot.id,
                name: snapshot.name,
                type: layerType,
                visible: snapshot.visible,
                locked: snapshot.locked,
                opacity: snapshot.opacity,
              };

              if (layerType === "image") {
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

              // Stroke layer (default)
              return {
                ...baseLayer,
                strokes: snapshot.strokes || [],
              };
            }) as any;
          } catch (e) {
            // During layer reordering, nodes may be detached
            console.warn("getLayers: layer access error", e);
            return [];
          }
        },
        getActiveLayerId: () => canvasStore.activeLayerId,
        // Provide selected layer ID for transform handles
        getSelectedLayerId: () => canvasStore.selectedLayerId,
        // Use a dynamic brush options builder bound to the latest settings
        getBrushOptions: (brush, size) =>
          createGetBrushOptions(canvasStore.brushSettings as any)(
            brush as any,
            size
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
      [canvasStore.panX, canvasStore.panY, canvasStore.zoom]
    );

    // Hit test image layers - returns the topmost image layer at the given canvas coordinates
    const hitTestImageLayers = useCallback(
      (canvasX: number, canvasY: number): string | null => {
        // Iterate layers from top to bottom (reverse order)
        const layers = canvasStore.visibleLayers;
        for (let i = layers.length - 1; i >= 0; i--) {
          const layer = layers[i];
          if (layer.type !== "image" || layer.locked) continue;

          const imgLayer = layer as any;
          const { x, y, width, height } = imgLayer;

          // Simple bounding box hit test (no rotation for now)
          if (
            canvasX >= x &&
            canvasX <= x + width &&
            canvasY >= y &&
            canvasY <= y + height
          ) {
            return layer.id;
          }
        }
        return null;
      },
      [canvasStore.visibleLayers]
    );

    // Hit test transform handles - returns handle type if hit, null otherwise
    const hitTestTransformHandles = useCallback(
      (screenX: number, screenY: number): TransformHandleType | null => {
        const selectedLayer = canvasStore.selectedImageLayer;
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

        return transformController.hitTest(
          { x: localX, y: localY },
          selectedLayer as ImageLayerLike,
          viewport
        );
      },
      [
        canvasStore.selectedImageLayer,
        canvasStore.zoom,
        canvasStore.panX,
        canvasStore.panY,
      ]
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
        }
        if (e.key === "Shift") {
          shiftDownRef.current = true;
        }
        // ESC to exit transform mode
        if (e.key === "Escape" && canvasStore.isTransformMode) {
          e.preventDefault();
          canvasStore.deselectLayer();
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          e.preventDefault();
          setSpacePressed(false);
          setIsPanning(false);
          setLastPanPoint(null);
        }
        if (e.key === "Shift") {
          shiftDownRef.current = false;
          lastShiftUpTsRef.current = performance.now();
        }
      };

      // Prevent browser zoom/scroll if the pointer is over the canvas area, but still let the event reach our canvas handler
      const handleGlobalWheel = (e: WheelEvent) => {
        const root = rootRef.current;
        if (!root) return;
        const target = e.target as Node | null;
        const inside = !!target && (target === root || root.contains(target));
        if (!inside) return;
        if (e.ctrlKey) {
          // Only block default when user is trying to zoom the page
          e.preventDefault();
        }
      };

      // Additional prevention for touchstart to prevent pinch gestures
      const handleTouchStart = (e: TouchEvent) => {
        const root = rootRef.current;
        if (root && root.contains(e.target as Node) && e.touches.length > 1) {
          e.preventDefault();
        }
      };

      // Prevent gesturestart which can trigger zoom
      const handleGestureStart = (e: Event) => {
        const root = rootRef.current;
        if (root && root.contains(e.target as Node)) {
          e.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("wheel", handleGlobalWheel, {
        passive: false,
        capture: true,
      });
      window.addEventListener("touchstart", handleTouchStart, {
        passive: false,
      });
      window.addEventListener("gesturestart", handleGestureStart, {
        passive: false,
      });

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("wheel", handleGlobalWheel, true);
        window.removeEventListener("touchstart", handleTouchStart);
        window.removeEventListener("gesturestart", handleGestureStart);
      };
    }, []);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault();
        const root = rootRef.current;
        if (!root) return;
        root.focus?.();

        // Pan mode: middle mouse button or space + left click
        if (
          e.button === 1 ||
          (spacePressed && e.button === 0) ||
          !isDrawingMode
        ) {
          setIsPanning(true);
          setLastPanPoint({ x: e.clientX, y: e.clientY });
          return;
        }

        // Left click in drawing mode
        if (isDrawingMode && e.button === 0) {
          const point = screenToCanvas(e.clientX, e.clientY);

          // If in transform mode, check for handle interactions first
          if (canvasStore.isTransformMode && canvasStore.selectedImageLayer) {
            const handle = hitTestTransformHandles(e.clientX, e.clientY);

            if (handle) {
              // Start transform operation using TransformController
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

              const startState = transformController.captureStartState(
                { x: localX, y: localY },
                canvasStore.selectedImageLayer as ImageLayerLike,
                viewport
              );

              setIsTransforming(true);
              setTransformHandle(handle);
              setTransformStart(startState);
              return;
            }
          }

          // Check if clicking on an image layer
          const hitLayerId = hitTestImageLayers(point.x, point.y);

          if (hitLayerId) {
            // Select the image layer and enter transform mode
            canvasStore.selectLayer(hitLayerId);
            return;
          }

          // If in transform mode but clicked outside any image, deselect
          if (canvasStore.isTransformMode) {
            canvasStore.deselectLayer();
          }

          // Start drawing
          setIsDrawing(true);
          point.pressure = e.pressure || 0.5;
          setCurrentPoints([point]);
        }
      },
      [
        screenToCanvas,
        isDrawingMode,
        spacePressed,
        hitTestImageLayers,
        hitTestTransformHandles,
        canvasStore,
      ]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        // Update mouse position for eraser cursor
        setMousePosition({ x: e.clientX, y: e.clientY });

        if (isPanning && lastPanPoint) {
          // Panning
          const deltaX = e.clientX - lastPanPoint.x;
          const deltaY = e.clientY - lastPanPoint.y;
          canvasStore.setPan(
            canvasStore.panX + deltaX,
            canvasStore.panY + deltaY
          );
          setLastPanPoint({ x: e.clientX, y: e.clientY });
        } else if (
          isTransforming &&
          transformHandle &&
          transformStart &&
          canvasStore.selectedImageLayer
        ) {
          // Handle transform operations using TransformController
          const layer = canvasStore.selectedImageLayer as any;
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
              viewport
            );
            layer.setPosition(result.x, result.y);
          } else if (transformHandle === "rotate") {
            result = transformController.applyRotation(
              { x: localX, y: localY },
              transformStart,
              viewport
            );
            layer.setRotation(result.rotation);
          } else if (["nw", "ne", "se", "sw"].includes(transformHandle)) {
            const maintainAspect = !e.shiftKey; // Shift to free resize
            result = transformController.applyResize(
              transformHandle as "nw" | "ne" | "se" | "sw",
              { x: localX, y: localY },
              transformStart,
              viewport,
              maintainAspect
            );
            layer.setPosition(result.x, result.y);
            layer.setSize(result.width, result.height, false);
          }
        } else if (isDrawing && isDrawingMode) {
          // Drawing
          const point = screenToCanvas(e.clientX, e.clientY);
          point.pressure = e.pressure || 0.5;

          if (canvasStore.currentBrushStyle === "eraser") {
            // For eraser, just collect points - no real-time erasing for performance
            // Erasing will happen on stroke completion
          }

          // Min-distance filter to reduce point density and preview work
          const MIN_DIST = 0.5; // world units
          setCurrentPoints((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return [point];
            const dx = point.x - last.x;
            const dy = point.y - last.y;
            if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return prev;
            return [...prev, point];
          });
        }
      },
      [
        isDrawing,
        isPanning,
        isTransforming,
        transformHandle,
        transformStart,
        isDrawingMode,
        lastPanPoint,
        canvasStore,
      ]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent) => {
        // no pointer capture on root div

        // End transform operation
        if (isTransforming) {
          setIsTransforming(false);
          setTransformHandle(null);
          setTransformStart(null);
          return;
        }

        if (isDrawing && isDrawingMode) {
          setIsDrawing(false);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
          if (currentPoints.length > 1) {
            // Add a stroke to the active layer (or legacy strokes if no layers)
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
              timestamp: Date.now(),
            };

            // Use layer-aware stroke addition if layers exist
            if (canvasStore.hasLayers) {
              canvasStore.addStrokeToActiveLayer(strokeData);
            } else {
              canvasStore.addStroke(strokeData);
            }
          }
          setCurrentPoints([]);
        } else if (isPanning) {
          setIsPanning(false);
          setLastPanPoint(null);
        }
      },
      [
        isDrawing,
        isPanning,
        isTransforming,
        isDrawingMode,
        currentPoints,
        canvasStore,
      ]
    );

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
            Math.min(5, canvasStore.zoom * zoomFactor)
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
            canvasStore.panY
          );
        } else {
          // Vertical + incidental horizontal from trackpads: prioritize vertical scroll for panY
          // Use deltaX for sideways pan only if present (trackpad gesture)
          const nextPanX = canvasStore.panX - e.deltaX * 0.5;
          const nextPanY = canvasStore.panY - e.deltaY * 0.5;
          canvasStore.setPan(nextPanX, nextPanY);
        }
      },
      [canvasStore]
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

    // Handle clipboard paste for image import
    const handleImagePaste = useCallback(
      async (file: File) => {
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
              centerY
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
      [canvasStore, mousePosition]
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
                  type.startsWith("image/")
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

    const handlePointerLeave = useCallback(() => {
      // Clear mouse position when leaving canvas
      setMousePosition(null);
      // Hide eraser cursor overlay when leaving
      engineRef.current?.setCursor({ visible: false });

      // Cancel any pending preview
      // and clear preview immediately
      // to avoid ghost previews when leaving
      // the drawing surface
      //
      // Note: engine will also be invalidated
      // on state changes
      // so this is safe.
      //
      // Cancel RAF if scheduled
      // and clear engine preview
      //
      // Then handle ongoing interactions
      if (previewRafRef.current) {
        cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      engineRef.current?.setPreviewStroke(null);

      // Safely release any pointer capture if present
      const root = rootRef.current;
      root?.blur?.();

      // Handle any ongoing drawing interactions
      if (isDrawing && isDrawingMode) {
        setIsDrawing(false);
        if (currentPoints.length > 1) {
          const stroke = {
            id: Date.now().toString(),
            points: currentPoints,
            color: canvasStore.currentColor,
            size:
              canvasStore.currentBrushStyle === "eraser"
                ? canvasStore.eraserSize
                : canvasStore.currentSize,
            opacity: canvasStore.brushSettings.opacity ?? 1,
            brushStyle: canvasStore.currentBrushStyle,
            timestamp: Date.now(),
          } as IStroke;

          // Use layer-aware stroke addition if layers exist
          if (canvasStore.hasLayers) {
            canvasStore.addStrokeToActiveLayer(stroke as any);
          } else {
            canvasStore.addStroke(stroke);
          }
        }
        setCurrentPoints([]);
      }

      // Handle panning
      if (isPanning) {
        setIsPanning(false);
        setLastPanPoint(null);
      }
    }, [isDrawing, isDrawingMode, currentPoints, canvasStore, isPanning]);

    const getCursorStyle = () => {
      if (spacePressed || isPanning) return "cursor-grabbing";
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
          mousePosition.y
        );
        if (handle === "move") return "cursor-move";
        if (handle === "rotate") return "cursor-alias";
        if (handle === "nw" || handle === "se") return "cursor-nwse-resize";
        if (handle === "ne" || handle === "sw") return "cursor-nesw-resize";
      }

      if (canvasStore.currentBrushStyle === "eraser") return "cursor-none"; // Hide cursor for eraser
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
        canvasStore.currentBrushStyle === "eraser" &&
        !isPanning &&
        !spacePressed
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
      canvasStore.currentBrushStyle,
      canvasStore.eraserSize,
      canvasStore.zoom,
      isPanning,
      spacePressed,
    ]);

    return (
      <div
        ref={rootRef}
        className={`fixed inset-0 touch-none ${getCursorStyle()} ${className}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
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
  }
);

export default DrawingCanvas;
