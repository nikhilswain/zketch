// Utility: PF-recommended SVG path generator
const average = (a: number, b: number) => (a + b) / 2;
function getSvgPathFromStroke(points: number[][], closed = true) {
  const len = points.length;
  if (len < 4) return "";
  let a = points[0],
    b = points[1],
    c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }
  if (closed) result += "Z";
  return result;
}
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

    // Canvas size / resize
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

    // Coordinate conversion
    const screenToCanvas = useCallback(
      (clientX: number, clientY: number): IPoint => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

        const x = (clientX - canvasStore.panX) / canvasStore.zoom;
        const y = (clientY - canvasStore.panY) / canvasStore.zoom;
        return { x, y, pressure: 0.5 };
      },
      [canvasStore.panX, canvasStore.panY, canvasStore.zoom]
    );

    // Easing functions for taper start/end
    const easingFn = (name: string) => {
      switch (name) {
        case "easeIn":
          return (t: number) => t * t;
        case "easeOut":
          return (t: number) => 1 - Math.pow(1 - t, 2);
        case "easeInOut":
          return (t: number) =>
            t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        default:
          return (t: number) => t; // linear
      }
    };

    const getBrushOptions = useCallback(
      (brushStyle: string, size: number) => {
        const baseOptions = {
          size: size,
          thinning: canvasStore.brushSettings.thinning,
          smoothing: canvasStore.brushSettings.smoothing,
          streamline: canvasStore.brushSettings.streamline,
          simulatePressure: true,
          last: true,
        } as any;

        switch (brushStyle) {
          case "ink":
            return {
              ...baseOptions,
              thinning: canvasStore.brushSettings.thinning,
              smoothing: canvasStore.brushSettings.smoothing,
              streamline: canvasStore.brushSettings.streamline,
              easing: easingFn(canvasStore.brushSettings.easing),
              start: {
                taper: canvasStore.brushSettings.taperStart,
                easing: easingFn(canvasStore.brushSettings.easing),
              },
              end: {
                taper: canvasStore.brushSettings.taperEnd,
                easing: easingFn(canvasStore.brushSettings.easing),
              },
            };
          case "marker":
            return {
              ...baseOptions,
              thinning: 0,
              smoothing: 0.3,
              streamline: 0.3,
              start: { cap: true, taper: 0, easing: (t: number) => t },
              end: { cap: true, taper: 0, easing: (t: number) => t },
            };
          case "eraser":
            return {
              ...baseOptions,
              thinning: 0.3,
              smoothing: 0.6,
              streamline: 0.6,
              start: { cap: true, taper: 0, easing: (t: number) => t },
              end: { cap: true, taper: 0, easing: (t: number) => t },
            };
          case "spray":
            return {
              ...baseOptions,
              thinning: 0.8,
              smoothing: 0.3,
              streamline: 0.3,
              start: { cap: false, taper: 0, easing: (t: number) => t },
              end: { cap: false, taper: 0, easing: (t: number) => t },
            };
          case "texture":
            return {
              ...baseOptions,
              thinning: 0.7,
              smoothing: 0.5,
              streamline: 0.5,
              start: { cap: false, taper: 10, easing: (t: number) => t },
              end: { cap: false, taper: 10, easing: (t: number) => t },
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
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;

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
        ctx.globalAlpha = prevAlpha;
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
        const basePrevAlpha = ctx.globalAlpha;
        const strokeAlpha = stroke.opacity ?? 1;
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

          ctx.globalAlpha = layerOpacity * strokeAlpha * basePrevAlpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);

          for (let i = 1; i < outlinePoints.length; i++) {
            ctx.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
          }

          ctx.closePath();
          ctx.fill();
        }

        ctx.globalAlpha = basePrevAlpha;
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

        // Set composite per stroke: eraser cuts holes; others draw on top
        const prevComposite = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation =
          stroke.brushStyle === "eraser"
            ? ("destination-out" as GlobalCompositeOperation)
            : "source-over";

        // Special rendering for different brush types
        switch (stroke.brushStyle) {
          case "spray":
            renderSprayBrush(ctx, inputPoints, stroke);
            break;
          case "texture":
            renderTextureBrush(ctx, inputPoints, stroke, options);
            break;
          default:
            // Standard perfect-freehand rendering using Path2D for smooth edges
            const outlinePoints = getStroke(inputPoints, options);
            if (outlinePoints.length < 3) return;
            const prevAlpha = ctx.globalAlpha;
            ctx.fillStyle = stroke.color;
            ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
            const pathData = getSvgPathFromStroke(outlinePoints);
            if (pathData) {
              const path = new Path2D(pathData);
              ctx.fill(path);
            }
            ctx.globalAlpha = prevAlpha;
            break;
        }

        // Reset composite operation
        ctx.globalCompositeOperation = prevComposite;
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
          !isDrawingMode ||
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
          (canvasStore.eraserSize * canvasStore.zoom) / 2,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        ctx.restore();
      },
      [
        mousePosition,
        isDrawingMode,
        canvasStore.currentBrushStyle,
        canvasStore.eraserSize,
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

      // Clear canvas (draw background/grid later using destination-over)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply transformation once
      ctx.save();
      ctx.translate(canvasStore.panX, canvasStore.panY);
      ctx.scale(canvasStore.zoom, canvasStore.zoom);

      // Render all strokes
      canvasStore.strokes.forEach((stroke: IStroke) => {
        renderStroke(ctx, stroke);
      });

      // Render current stroke being drawn (including eraser preview)
      if (currentPoints.length > 1) {
        const tempStroke = {
          id: "temp",
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
        renderStroke(ctx, tempStroke as IStroke);
      }

      ctx.restore();

      // Draw background/grid under strokes using destination-over so eraser never affects it
      if (canvasStore.background === "grid") {
        // First draw world-grid under content
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.translate(canvasStore.panX, canvasStore.panY);
        ctx.scale(canvasStore.zoom, canvasStore.zoom);
        drawWorldGrid(ctx);
        ctx.restore();

        // Then fill any remaining transparent areas with white under everything
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else if (canvasStore.background === "white") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Render eraser cursor (after background)
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
        const canvas = canvasRef.current;
        if (!canvas) return;
        const target = e.target as Node | null;
        const inside =
          !!target && (target === canvas || canvas.contains(target));
        if (!inside) return;
        if (e.ctrlKey) {
          // Only block default when user is trying to zoom the page
          e.preventDefault();
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
      ]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (canvas) {
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch (error) {
            // Ignore errors if pointer capture is not active
            console.debug("Failed to release pointer capture:", error);
          }
        }

        if (isDrawing && isDrawingMode) {
          setIsDrawing(false);
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

      // Safely release any pointer capture if present
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          // We can't know the pointerId here; calling without id isn't allowed.
          // Instead, just try to release all known captures by blurring.
          canvas.blur();
        } catch {}
      }

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
          overscrollBehavior: "none",
          KhtmlUserSelect: "none",
          zIndex: 0,
        }}
      />
    );
  }
);

export default DrawingCanvas;
