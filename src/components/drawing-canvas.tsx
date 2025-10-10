import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useCanvasStore } from "../hooks/useStores";
import type { IPoint, IStroke } from "@/models/CanvasModel";
import { CanvasEngine } from "@/engine";
import type { StrokeLike } from "@/engine";
import { createGetBrushOptions } from "@/engine/brushOptions";

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

    // Mount layered engine (background + strokes). Engine handles its own resizing.
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const engine = new CanvasEngine(root, {
        background: canvasStore.background as any,
        getStrokes: () => canvasStore.strokes as unknown as StrokeLike[],
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

        // Drawing mode
        if (isDrawingMode && e.button === 0) {
          setIsDrawing(true);
          const point = screenToCanvas(e.clientX, e.clientY);
          point.pressure = e.pressure || 0.5;
          setCurrentPoints([point]);
        }
      },
      [screenToCanvas, isDrawingMode, spacePressed]
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
        isDrawingMode,
        lastPanPoint,
        screenToCanvas,
        canvasStore,
      ]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent) => {
        // no pointer capture on root div

        if (isDrawing && isDrawingMode) {
          setIsDrawing(false);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
          if (currentPoints.length > 1) {
            // Add a stroke for both draw and eraser; eraser will be composited out during render
            canvasStore.addStroke({
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
            });
          }
          setCurrentPoints([]);
        } else if (isPanning) {
          setIsPanning(false);
          setLastPanPoint(null);
        }
      },
      [isDrawing, isPanning, isDrawingMode, currentPoints, canvasStore]
    );

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Handle touchpad pinch zoom (ctrlKey) or regular zoom
        if (e.ctrlKey || Math.abs(e.deltaY) > 50) {
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const newZoom = Math.max(0.1, Math.min(5, canvasStore.zoom * delta));

          // Zoom towards mouse position
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // world from screen: (screen - pan) / zoom
            const worldX = (mouseX - canvasStore.panX) / canvasStore.zoom;
            const worldY = (mouseY - canvasStore.panY) / canvasStore.zoom;

            // keep mouse position stable: screen = newZoom*world + newPan
            const newPanX = mouseX - worldX * newZoom;
            const newPanY = mouseY - worldY * newZoom;

            canvasStore.setZoom(newZoom);
            canvasStore.setPan(newPanX, newPanY);
          }
        } else {
          // Determine axis lock: if Shift is held, lock to horizontal using vertical wheel
          // Keep the lock briefly to absorb inertial/momentum after Shift release
          const recentlyShifted =
            performance.now() - lastShiftUpTsRef.current < 600;
          const nowLock =
            e.shiftKey || shiftDownRef.current || recentlyShifted
              ? "horizontal"
              : "none";
          if (nowLock === "horizontal") {
            wheelAxisLockRef.current = "horizontal";
          }

          // Clear/restart lock timeout
          if (wheelAxisResetTimerRef.current) {
            window.clearTimeout(wheelAxisResetTimerRef.current);
          }
          wheelAxisResetTimerRef.current = window.setTimeout(() => {
            wheelAxisLockRef.current = "none";
            wheelAxisResetTimerRef.current = null;
          }, 600);

          const lock = wheelAxisLockRef.current;
          if (lock === "horizontal") {
            canvasStore.setPan(
              canvasStore.panX - e.deltaY * 0.5,
              canvasStore.panY
            );
          } else {
            canvasStore.setPan(
              canvasStore.panX - e.deltaX * 0.5,
              canvasStore.panY - e.deltaY * 0.5
            );
          }
        }
      },
      [canvasStore]
    );

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
          canvasStore.addStroke(stroke);
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
        onWheel={handleWheel}
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
