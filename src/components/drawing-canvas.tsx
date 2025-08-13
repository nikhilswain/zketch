import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { getStroke } from "perfect-freehand";
import { useCanvasStore } from "../hooks/useStores";
import type { IPoint, IStroke, Stroke } from "@/models/canvas-model";

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
          default:
            return baseOptions;
        }
      },
      [canvasStore.brushSettings]
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

        // Get stroke outline points
        const outlinePoints = getStroke(inputPoints, options);

        if (outlinePoints.length < 3) return;

        // Draw the stroke
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

        for (let i = 1; i < outlinePoints.length; i++) {
          ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
        }

        ctx.closePath();
        ctx.fill();
      },
      [getBrushOptions]
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
        drawGrid(ctx);
      }

      // Apply transformation once
      ctx.save();
      ctx.translate(canvasStore.panX, canvasStore.panY);
      ctx.scale(canvasStore.zoom, canvasStore.zoom);

      // Render all strokes
      canvasStore.strokes.forEach((stroke: IStroke) => {
        renderStroke(ctx, stroke);
      });

      // Render current stroke being drawn
      if (currentPoints.length > 1) {
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
    }, [
      canvasStore.strokes,
      canvasStore.background,
      canvasStore.currentColor,
      canvasStore.currentSize,
      canvasStore.currentBrushStyle,
      canvasStore.zoom,
      canvasStore.panX,
      canvasStore.panY,
      currentPoints,
      drawGrid,
      renderStroke,
    ]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          setSpacePressed(true);
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

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
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
            canvasStore.addStroke({
              id: crypto.randomUUID(),
              points: currentPoints.map((point) => ({ ...point })),
              color: canvasStore.currentColor,
              size: canvasStore.currentSize,
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
        // Only zoom if Ctrl key is pressed
        if (!e.ctrlKey) return;

        e.preventDefault();
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
      },
      [canvasStore]
    );

    useEffect(() => {
      renderStrokes();
    }, [renderStrokes]);

    const getCursorStyle = () => {
      if (spacePressed || isPanning) return "cursor-grabbing";
      if (!isDrawingMode) return "cursor-grab";
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
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ outline: "none" }}
      />
    );
  }
);

export default DrawingCanvas;
