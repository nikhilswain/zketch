import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { getStroke } from "perfect-freehand";
import { useCanvasStore } from "../hooks/useStores";
import type { IPoint, IStroke } from "@/models/CanvasModel";

interface DrawingCanvasProps {
  isDrawingMode: boolean;
  className?: string;
  width?: number;
  height?: number;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = observer(
  ({ isDrawingMode, className, width, height }) => {
    const canvasStore = useCanvasStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const [lastEraseTime, setLastEraseTime] = useState(0);
    const [eraserThrottle, setEraserThrottle] = useState(50); // Much slower for performance

    useEffect(() => {
      const updateCanvasSize = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (width && height) {
          canvas.width = width;
          canvas.height = height;
        } else {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
        }

        // Redraw after resize
        renderStrokes();
      };

      updateCanvasSize();
      window.addEventListener("resize", updateCanvasSize);
      return () => window.removeEventListener("resize", updateCanvasSize);
    }, [width, height]);

    const screenToCanvas = useCallback(
      (clientX: number, clientY: number): IPoint => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

        // Simple coordinate conversion accounting for zoom and pan
        const x = (clientX - canvasStore.panX) / canvasStore.zoom;
        const y = (clientY - canvasStore.panY) / canvasStore.zoom;

        return { x, y, pressure: 0.5 };
      },
      [canvasStore.panX, canvasStore.panY, canvasStore.zoom]
    );

    const getBrushOptions = useCallback(
      (brushStyle: string, size: number) => {
        const baseOptions = {
          size: size,
          thinning: canvasStore.brushSettings.thinning,
          smoothing: canvasStore.brushSettings.smoothing,
          streamline: canvasStore.brushSettings.streamline,
          simulatePressure: true,
          last: true,
        };

        switch (brushStyle) {
          case "ink":
            return {
              ...baseOptions,
              thinning: canvasStore.brushSettings.thinning,
              smoothing: canvasStore.brushSettings.smoothing,
              streamline: canvasStore.brushSettings.streamline,
              start: { cap: true, taper: 0 },
              end: { cap: true, taper: 100 },
            };
          case "marker":
            return {
              ...baseOptions,
              thinning: 0,
              smoothing: 0.3,
              streamline: 0.3,
              start: { cap: true, taper: 0 },
              end: { cap: true, taper: 0 },
            };
          case "brush":
            return {
              ...baseOptions,
              thinning: 0.8,
              smoothing: 0.6,
              streamline: 0.6,
              start: { cap: false, taper: 20 },
              end: { cap: false, taper: 80 },
            };
          case "calligraphy":
            return {
              ...baseOptions,
              thinning: 0.9,
              smoothing: 0.4,
              streamline: 0.4,
              start: { cap: false, taper: 50 },
              end: { cap: false, taper: 50 },
            };
          case "pencil":
            return {
              ...baseOptions,
              thinning: 0.6,
              smoothing: 0.9,
              streamline: 0.9,
              start: { cap: true, taper: 5 },
              end: { cap: true, taper: 5 },
            };
          case "eraser":
            return {
              ...baseOptions,
              thinning: 0.3,
              smoothing: 0.6,
              streamline: 0.6,
              start: { cap: true, taper: 0 },
              end: { cap: true, taper: 0 },
            };
          case "spray":
            return {
              ...baseOptions,
              thinning: 0.8,
              smoothing: 0.3,
              streamline: 0.3,
              start: { cap: false, taper: 0 },
              end: { cap: false, taper: 0 },
            };
          case "texture":
            return {
              ...baseOptions,
              thinning: 0.7,
              smoothing: 0.5,
              streamline: 0.5,
              start: { cap: false, taper: 10 },
              end: { cap: false, taper: 10 },
            };
          default:
            return baseOptions;
        }
      },
      [canvasStore.brushSettings]
    );

    // Specialized brush rendering functions
    // Deterministic pseudo-random function to prevent texture vibration
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const renderSprayBrush = useCallback(
      (ctx: CanvasRenderingContext2D, inputPoints: number[][], stroke: any) => {
        const size = stroke.size;
        const color = stroke.color; // Use stroke color directly (composite operation handles erasing)

        ctx.fillStyle = color;

        for (let i = 0; i < inputPoints.length; i++) {
          const [x, y, pressure] = inputPoints[i];
          const currentSize = size * (pressure || 0.5);
          const density = Math.max(3, currentSize * 0.3);

          for (let j = 0; j < density; j++) {
            // Use deterministic random based on point position and spray index
            const seed1 = x * 1000 + y * 100 + j * 10 + i;
            const seed2 = x * 100 + y * 1000 + j * 5 + i * 2;
            const seed3 = x * 10 + y * 10 + j + i * 3;

            const angle = seededRandom(seed1) * Math.PI * 2;
            const distance = seededRandom(seed2) * currentSize * 0.8;
            const sprayX = x + Math.cos(angle) * distance;
            const sprayY = y + Math.sin(angle) * distance;
            const dotSize = seededRandom(seed3) * 2 + 0.5;

            ctx.beginPath();
            ctx.arc(sprayX, sprayY, dotSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      [canvasStore.background]
    );

    const renderTextureBrush = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        inputPoints: number[][],
        stroke: any,
        options: any
      ) => {
        const size = stroke.size;
        const color = stroke.color; // Use stroke color directly (composite operation handles erasing)

        // Create texture pattern using multiple overlapping strokes
        for (let layer = 0; layer < 3; layer++) {
          const layerOpacity = 0.3 - layer * 0.1;
          const layerOffset = layer * 2;

          const offsetPoints = inputPoints.map(
            ([x, y, pressure], pointIndex) => {
              // Use deterministic random based on point position and layer
              const seed1 = x * 1000 + y * 100 + layer * 50 + pointIndex;
              const seed2 = x * 100 + y * 1000 + layer * 25 + pointIndex * 2;

              return [
                x + (seededRandom(seed1) - 0.5) * layerOffset,
                y + (seededRandom(seed2) - 0.5) * layerOffset,
                pressure,
              ];
            }
          );

          const outlinePoints = getStroke(offsetPoints, {
            ...options,
            size: size * (0.8 + layer * 0.1),
          });

          if (outlinePoints.length < 3) continue;

          ctx.globalAlpha = layerOpacity;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

          for (let i = 1; i < outlinePoints.length; i++) {
            ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
          }

          ctx.closePath();
          ctx.fill();
        }

        ctx.globalAlpha = 1.0;
      },
      [canvasStore.background]
    );

    const renderStroke = useCallback(
      (ctx: CanvasRenderingContext2D, stroke: IStroke | any) => {
        if (stroke.points.length < 2) return;

        // Convert points to the format expected by perfect-freehand
        const inputPoints = stroke.points.map((p: any) => [
          p.x,
          p.y,
          p.pressure || 0.5,
        ]);
        const options = getBrushOptions(stroke.brushStyle, stroke.size);

        // Skip eraser strokes - they don't get rendered, they remove data
        if (stroke.brushStyle === "eraser") {
          return;
        }

        // Normal rendering mode for all visible strokes
        ctx.globalCompositeOperation = "source-over";

        // Special rendering for different brush types
        switch (stroke.brushStyle) {
          case "spray":
            renderSprayBrush(ctx, inputPoints, stroke);
            break;
          case "texture":
            renderTextureBrush(ctx, inputPoints, stroke, options);
            break;
          default:
            // Standard perfect-freehand rendering
            const outlinePoints = getStroke(inputPoints, options);
            if (outlinePoints.length < 3) return;

            // Use the stroke color for all visible strokes
            ctx.fillStyle = stroke.color;

            ctx.beginPath();
            ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

            for (let i = 1; i < outlinePoints.length; i++) {
              ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
            }

            ctx.closePath();
            ctx.fill();
            break;
        }

        // Reset composite operation
        ctx.globalCompositeOperation = "source-over";
      },
      [getBrushOptions, canvasStore.background]
    );

    const drawGrid = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        const gridSize = 20 * canvasStore.zoom;
        const canvas = canvasRef.current;
        if (!canvas) return;

        ctx.strokeStyle = "#f0f0f0";
        ctx.lineWidth = 1;

        // Calculate grid offset based on pan
        const offsetX = canvasStore.panX % gridSize;
        const offsetY = canvasStore.panY % gridSize;

        // Draw vertical lines
        for (let x = offsetX; x < canvas.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = offsetY; y < canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      },
      [canvasStore.zoom, canvasStore.panX, canvasStore.panY]
    );

    const drawWorldGrid = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        const gridSize = 20;
        const canvas = canvasRef.current;
        if (!canvas) return;

        ctx.strokeStyle = "#f0f0f0";
        ctx.lineWidth = 1 / canvasStore.zoom; // Adjust for zoom

        // Calculate world bounds (what's visible in world coordinates)
        const worldLeft = -canvasStore.panX / canvasStore.zoom;
        const worldRight = (canvas.width - canvasStore.panX) / canvasStore.zoom;
        const worldTop = -canvasStore.panY / canvasStore.zoom;
        const worldBottom =
          (canvas.height - canvasStore.panY) / canvasStore.zoom;

        // Draw vertical lines
        const startX = Math.floor(worldLeft / gridSize) * gridSize;
        const endX = Math.ceil(worldRight / gridSize) * gridSize;
        for (let x = startX; x <= endX; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, worldTop - gridSize);
          ctx.lineTo(x, worldBottom + gridSize);
          ctx.stroke();
        }

        // Draw horizontal lines
        const startY = Math.floor(worldTop / gridSize) * gridSize;
        const endY = Math.ceil(worldBottom / gridSize) * gridSize;
        for (let y = startY; y <= endY; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(worldLeft - gridSize, y);
          ctx.lineTo(worldRight + gridSize, y);
          ctx.stroke();
        }
      },
      [canvasStore.zoom, canvasStore.panX, canvasStore.panY]
    );

    const renderEraserCursor = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        if (
          !mousePosition ||
          canvasStore.currentBrushStyle !== "eraser" ||
          isPanning ||
          spacePressed
        ) {
          return;
        }

        // Show eraser cursor even while erasing (removed isDrawing check)
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Convert screen coordinates to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const canvasX = mousePosition.x - rect.left;
        const canvasY = mousePosition.y - rect.top;

        // Draw eraser cursor circle
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to draw in screen space

        ctx.strokeStyle = "#666666";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(
          canvasX,
          canvasY,
          (canvasStore.currentSize * canvasStore.zoom) / 2,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        ctx.restore();
      },
      [
        mousePosition,
        canvasStore.currentBrushStyle,
        canvasStore.currentSize,
        canvasStore.zoom,
        isDrawing,
        isPanning,
        spacePressed,
      ]
    );

    const renderStrokes = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set background
      if (canvasStore.background === "white") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (canvasStore.background === "grid") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Don't draw grid here, we'll draw it in world space after transform
      }

      // Apply transformation once
      ctx.save();
      ctx.translate(canvasStore.panX, canvasStore.panY);
      ctx.scale(canvasStore.zoom, canvasStore.zoom);

      // Draw grid in world coordinates if needed
      if (canvasStore.background === "grid") {
        drawWorldGrid(ctx);
      }

      // Render all strokes
      canvasStore.strokes.forEach((stroke: IStroke) => {
        renderStroke(ctx, stroke);
      });

      // Render current stroke being drawn (except for eraser - no preview needed)
      if (
        currentPoints.length > 1 &&
        canvasStore.currentBrushStyle !== "eraser"
      ) {
        const tempStroke = {
          id: "temp",
          points: currentPoints.map((point) => ({ ...point })),
          color: canvasStore.currentColor,
          size: canvasStore.currentSize,
          brushStyle: canvasStore.currentBrushStyle,
          timestamp: Date.now(),
        };
        renderStroke(ctx, tempStroke as IStroke);
      }

      ctx.restore();

      // Render eraser cursor (after restoring transform)
      renderEraserCursor(ctx);
    }, [
      canvasStore.strokes,
      canvasStore.background,
      canvasStore.currentColor,
      canvasStore.currentSize,
      canvasStore.currentBrushStyle,
      canvasStore.zoom,
      canvasStore.panX,
      canvasStore.panY,
      canvasStore.renderVersion, // Add this to force re-renders on undo/redo
      currentPoints,
      drawGrid,
      drawWorldGrid,
      renderStroke,
      renderEraserCursor,
    ]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          setSpacePressed(true);
        }
        // Toggle eraser throttling with Ctrl+A
        if (e.code === "KeyA" && !e.repeat && e.ctrlKey) {
          e.preventDefault();
          // Cycle through throttle speeds for testing
          const newThrottle =
            eraserThrottle === 50 ? 100 : eraserThrottle === 100 ? 200 : 50;
          setEraserThrottle(newThrottle);
          console.log(
            `Eraser throttle: ${newThrottle}ms - Real-time erasing disabled for performance`
          );
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          e.preventDefault();
          setSpacePressed(false);
          setIsPanning(false);
          setLastPanPoint(null);
        }
      };

      // Prevent browser zoom when canvas is focused
      const handleGlobalWheel = (e: WheelEvent) => {
        const canvas = canvasRef.current;
        if (
          canvas &&
          (e.target === canvas || canvas.contains(e.target as Node))
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };

      // Additional prevention for touchstart to prevent pinch gestures
      const handleTouchStart = (e: TouchEvent) => {
        const canvas = canvasRef.current;
        if (
          canvas &&
          canvas.contains(e.target as Node) &&
          e.touches.length > 1
        ) {
          e.preventDefault();
        }
      };

      // Prevent gesturestart which can trigger zoom
      const handleGestureStart = (e: Event) => {
        const canvas = canvasRef.current;
        if (canvas && canvas.contains(e.target as Node)) {
          e.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("wheel", handleGlobalWheel, { passive: false });
      window.addEventListener("touchstart", handleTouchStart, {
        passive: false,
      });
      window.addEventListener("gesturestart", handleGestureStart, {
        passive: false,
      });

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("wheel", handleGlobalWheel);
        window.removeEventListener("touchstart", handleTouchStart);
        window.removeEventListener("gesturestart", handleGestureStart);
      };
    }, []);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.focus();
        canvas.setPointerCapture(e.pointerId);

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

          setCurrentPoints((prev) => [...prev, point]);
        }
      },
      [
        isDrawing,
        isPanning,
        isDrawingMode,
        lastPanPoint,
        screenToCanvas,
        canvasStore,
        lastEraseTime,
        eraserThrottle,
      ]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.releasePointerCapture(e.pointerId);
        }

        if (isDrawing && isDrawingMode) {
          setIsDrawing(false);
          if (currentPoints.length > 1) {
            if (canvasStore.currentBrushStyle === "eraser") {
              // Always use optimized advanced eraser for all backgrounds
              canvasStore.eraseStrokes(
                currentPoints.map((point) => ({ ...point })),
                canvasStore.currentSize
              );
            } else {
              canvasStore.addStroke({
                id: crypto.randomUUID(),
                points: currentPoints.map((point) => ({ ...point })),
                color: canvasStore.currentColor,
                size: canvasStore.currentSize,
                brushStyle: canvasStore.currentBrushStyle,
                timestamp: Date.now(),
              });
            }
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
          const rect = canvasRef.current?.getBoundingClientRect();
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
        } else {
          // Handle touchpad pan
          canvasStore.setPan(
            canvasStore.panX - e.deltaX * 0.5,
            canvasStore.panY - e.deltaY * 0.5
          );
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
      // Also handle any ongoing interactions
      handlePointerUp({} as React.PointerEvent);
    }, []);

    const getCursorStyle = () => {
      if (spacePressed || isPanning) return "cursor-grabbing";
      if (!isDrawingMode) return "cursor-grab";
      if (canvasStore.currentBrushStyle === "eraser") return "cursor-none"; // Hide cursor for eraser
      return "cursor-crosshair";
    };

    return (
      <canvas
        ref={canvasRef}
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
          // Prevent zoom and pan gestures
          msContentZooming: "none",
          KhtmlUserSelect: "none",
        }}
      />
    );
  }
);

export default DrawingCanvas;
