import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
  getSnapshot,
  isStateTreeNode,
} from "mobx-state-tree";

export const Point = types.model("Point", {
  x: types.number,
  y: types.number,
  pressure: types.optional(types.number, 1),
});

export const Stroke = types.model("Stroke", {
  id: types.identifier,
  points: types.array(Point),
  color: types.string,
  size: types.number,
  opacity: types.optional(types.number, 1),
  brushStyle: types.enumeration("BrushStyle", [
    "ink",
    "eraser",
    "spray",
    "texture",
  ]),
  timestamp: types.number,
});

export const BrushSettings = types.model("BrushSettings", {
  thinning: types.optional(types.number, 0.5),
  smoothing: types.optional(types.number, 0.5),
  streamline: types.optional(types.number, 0.5),
  taperStart: types.optional(types.number, 30),
  taperEnd: types.optional(types.number, 30),
  easing: types.optional(types.string, "linear"),
  opacity: types.optional(types.number, 1),
});

export const CanvasState = types.model("CanvasState", {
  strokes: types.array(Stroke),
  background: types.enumeration("BackgroundType", [
    "white",
    "transparent",
    "grid",
  ]),
  zoom: types.number,
  panX: types.number,
  panY: types.number,
});

export const CanvasModel = types
  .model("CanvasModel", {
    strokes: types.optional(types.array(Stroke), []),
    currentColor: types.optional(types.string, "#000000"),
    currentSize: types.optional(types.number, 4),
    eraserSize: types.optional(types.number, 20),
    currentBrushStyle: types.optional(
      types.enumeration("BrushStyle", ["ink", "eraser", "spray", "texture"]),
      "ink"
    ),
    background: types.optional(
      types.enumeration("BackgroundType", ["white", "transparent", "grid"]),
      "white"
    ),
    zoom: types.optional(types.number, 1),
    panX: types.optional(types.number, 0),
    panY: types.optional(types.number, 0),
    brushSettings: types.optional(BrushSettings, {}),
    // Eraser configuration - use optimized advanced eraser for all backgrounds
    useAdvancedEraserForAllBackgrounds: types.optional(types.boolean, true),
  })
  .volatile((self) => ({
    history: [] as SnapshotOut<typeof CanvasState>[],
    historyIndex: -1,
    maxHistorySize: 50,
    renderVersion: 0, // force re-renders
  }))
  .views((self) => ({
    get canUndo() {
      return self.historyIndex > 0;
    },
    get canRedo() {
      return self.historyIndex < self.history.length - 1;
    },
    get isEmpty() {
      return self.strokes.length === 0;
    },
    // Always use optimized advanced eraser for consistency
    get eraserMode(): "advanced" | "composite" {
      return "advanced"; // Always use advanced for all backgrounds
    },
    // Get the composite operation for composite eraser mode
    get eraserCompositeOperation(): "source-over" | "destination-out" {
      return self.background === "transparent"
        ? "destination-out"
        : "source-over";
    },
    // Get the eraser color for composite mode
    get eraserColor(): string {
      if (self.background === "transparent") {
        return "#000000"; // Color doesn't matter for destination-out
      }
      return "white"; // White paint for white/grid backgrounds
    },
  }))
  .actions((self) => {
    // First action block - internal helper actions
    const saveToHistory = () => {
      const state = {
        strokes: self.strokes.map((stroke) => ({
          id: stroke.id,
          points: stroke.points.map((p) => ({
            x: p.x,
            y: p.y,
            pressure: p.pressure,
          })),
          color: stroke.color,
          size: stroke.size,
          opacity: (stroke as any).opacity ?? 1,
          brushStyle: stroke.brushStyle,
          timestamp: stroke.timestamp,
        })),
        background: self.background,
        zoom: self.zoom,
        panX: self.panX,
        panY: self.panY,
      };

      // Remove any future history if we're not at the end
      if (self.historyIndex < self.history.length - 1) {
        self.history = self.history.slice(0, self.historyIndex + 1);
      }

      self.history.push(state);
      self.historyIndex = self.history.length - 1;

      // Limit history size
      if (self.history.length > self.maxHistorySize) {
        self.history.shift();
        self.historyIndex--;
      }
    };

    const clearStrokes = () => {
      self.strokes.clear();
    };

    const addStrokeToModel = (strokeData: SnapshotIn<typeof Stroke> | any) => {
      // If strokeData is already an MST instance, convert it to a snapshot first
      if (isStateTreeNode(strokeData)) {
        // It's already an MST instance, get its snapshot
        const snapshot = getSnapshot(strokeData as any);
        self.strokes.push(Stroke.create(snapshot as SnapshotIn<typeof Stroke>));
      } else {
        // It's a plain snapshot, create normally
        self.strokes.push(
          Stroke.create(strokeData as SnapshotIn<typeof Stroke>)
        );
      }
    };

    const updateState = (state: SnapshotOut<typeof CanvasState>) => {
      // Replace the entire strokes array atomically to ensure proper reactivity
      self.strokes.replace(
        state.strokes.map((strokeData) => Stroke.create(strokeData))
      );

      self.background = state.background as any;
      self.zoom = state.zoom;
      self.panX = state.panX;
      self.panY = state.panY;

      // Force a re-render by incrementing version
      self.renderVersion++;
    };

    const clearHistory = () => {
      self.history = [];
      self.historyIndex = -1;
    };

    return {
      saveToHistory,
      clearStrokes,
      addStrokeToModel,
      updateState,
      clearHistory,
    };
  })
  .actions((self) => {
    // Second action block - public API actions
    return {
      afterCreate() {
        self.saveToHistory();
      },
      addStroke(strokeData: SnapshotIn<typeof Stroke>) {
        self.addStrokeToModel(strokeData);
        self.saveToHistory();
        self.renderVersion++; // Force re-render
      },
      replaceStrokes(strokes: SnapshotIn<typeof Stroke>[]) {
        self.clearStrokes();
        strokes.forEach((strokeData) => {
          self.addStrokeToModel(strokeData);
        });
        self.saveToHistory();
        self.renderVersion++; // Force re-render
      },
      setBrushStyle(style: "ink" | "eraser" | "spray" | "texture") {
        self.currentBrushStyle = style;
      },
      setPenSize(size: number) {
        self.currentSize = Math.max(1, Math.min(50, size));
      },
      setEraserSize(size: number) {
        self.eraserSize = Math.max(1, Math.min(100, size));
        self.renderVersion++; // Force re-render to ensure UI updates
      },
      setColor(color: string) {
        self.currentColor = color;
      },
      setBackground(background: "white" | "transparent" | "grid") {
        self.background = background;
      },
      setZoom(zoom: number) {
        self.zoom = Math.max(0.1, Math.min(5, zoom));
      },
      setPan(x: number, y: number) {
        self.panX = x;
        self.panY = y;
      },
      setBrushSettings(
        settings: Partial<{
          thinning: number;
          smoothing: number;
          streamline: number;
          taperStart: number;
          taperEnd: number;
          easing: string;
          opacity: number;
        }>
      ) {
        if (settings.thinning !== undefined)
          self.brushSettings.thinning = settings.thinning;
        if (settings.smoothing !== undefined)
          self.brushSettings.smoothing = settings.smoothing;
        if (settings.streamline !== undefined)
          self.brushSettings.streamline = settings.streamline;
        if (settings.taperStart !== undefined)
          self.brushSettings.taperStart = settings.taperStart;
        if (settings.taperEnd !== undefined)
          self.brushSettings.taperEnd = settings.taperEnd;
        if (settings.easing !== undefined)
          self.brushSettings.easing = settings.easing;
        if (settings.opacity !== undefined)
          self.brushSettings.opacity = Math.max(
            0,
            Math.min(1, settings.opacity)
          );
      },
      clear() {
        self.clearStrokes();
        self.saveToHistory();
        self.renderVersion++; // Force re-render
      },
      undo() {
        if (self.historyIndex > 0) {
          self.historyIndex--;
          const state = self.history[self.historyIndex];
          if (state) {
            self.updateState(state);
          }
        }
      },
      redo() {
        if (self.historyIndex < self.history.length - 1) {
          self.historyIndex++;
          const state = self.history[self.historyIndex];
          if (state) {
            self.updateState(state);
          }
        }
      },
      // DEPRECATED: Geometry-based eraser is replaced by compositing eraser (destination-out).
      // Keeping method for backward compatibility; now a no-op.
      eraseStrokes(
        _eraserPath: { x: number; y: number; pressure: number }[],
        _eraserSize: number
      ) {
        // no-op: erasing is recorded as a stroke with brushStyle = 'eraser'
        return;
      },
      // DEPRECATED: real-time geometry erasing; no longer used. Left as a no-op.
      eraseAtPoint(_x: number, _y: number, _eraserSize: number) {
        return;
      },
      getStrokeBounds(points: { x: number; y: number; pressure: number }[]) {
        if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        let minX = points[0].x,
          maxX = points[0].x;
        let minY = points[0].y,
          maxY = points[0].y;

        for (const point of points) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }

        return { minX, minY, maxX, maxY };
      },
      intersectsCircle(
        bounds: { minX: number; minY: number; maxX: number; maxY: number },
        circleX: number,
        circleY: number,
        radius: number
      ): boolean {
        // Quick bounding box vs circle intersection test
        const closestX = Math.max(bounds.minX, Math.min(circleX, bounds.maxX));
        const closestY = Math.max(bounds.minY, Math.min(circleY, bounds.maxY));
        const distance = Math.sqrt(
          (circleX - closestX) ** 2 + (circleY - closestY) ** 2
        );
        return distance <= radius;
      },
      // DEPRECATED support helpers retained for compatibility (no-op implementations)
      splitStrokeByPoint(
        _stroke: SnapshotOut<typeof Stroke>,
        _x: number,
        _y: number,
        _eraserRadius: number
      ): SnapshotIn<typeof Stroke>[] {
        // return original stroke unchanged
        return [];
      },
      // No-op replacement for legacy splitStrokeByEraser (geometry eraser removed)
      splitStrokeByEraser(
        stroke: SnapshotOut<typeof Stroke>,
        _eraserPath: { x: number; y: number; pressure: number }[],
        _eraserSize: number
      ): SnapshotIn<typeof Stroke>[] {
        return [stroke as any];
      },
      saveCurrentStateToHistory() {
        self.saveToHistory();
      },
      setEraserMode(useAdvancedForAll: boolean) {
        self.useAdvancedEraserForAllBackgrounds = useAdvancedForAll;
      },
    };
  });

// Export type aliases for backward compatibility
export type BrushStyle = "ink" | "eraser" | "spray" | "texture";
export type BackgroundType = "white" | "transparent" | "grid";

export interface ICanvasModel extends Instance<typeof CanvasModel> {}
export interface IStroke extends Instance<typeof Stroke> {}
export interface IPoint extends Instance<typeof Point> {}

export default CanvasModel;
