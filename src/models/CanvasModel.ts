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
  brushStyle: types.enumeration("BrushStyle", [
    "ink",
    "marker",
    "brush",
    "calligraphy",
    "pencil",
    "eraser",
    "spray",
    "texture",
  ]),
  timestamp: types.number,
});

export const BrushSettings = types.model("BrushSettings", {
  thinning: types.optional(types.number, 0.7),
  smoothing: types.optional(types.number, 0.8),
  streamline: types.optional(types.number, 0.8),
});

export const CanvasState = types.model("CanvasState", {
  strokes: types.array(Stroke),
  currentColor: types.string,
  currentSize: types.number,
  currentBrushStyle: types.enumeration("BrushStyle", [
    "ink",
    "marker",
    "brush",
    "calligraphy",
    "pencil",
    "eraser",
    "spray",
    "texture",
  ]),
  background: types.enumeration("BackgroundType", [
    "white",
    "transparent",
    "grid",
  ]),
  zoom: types.number,
  panX: types.number,
  panY: types.number,
  brushSettings: BrushSettings,
});

export const CanvasModel = types
  .model("CanvasModel", {
    strokes: types.optional(types.array(Stroke), []),
    currentColor: types.optional(types.string, "#000000"),
    currentSize: types.optional(types.number, 4),
    currentBrushStyle: types.optional(
      types.enumeration("BrushStyle", [
        "ink",
        "marker",
        "brush",
        "calligraphy",
        "pencil",
        "eraser",
        "spray",
        "texture",
      ]),
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
          brushStyle: stroke.brushStyle,
          timestamp: stroke.timestamp,
        })),
        currentColor: self.currentColor,
        currentSize: self.currentSize,
        currentBrushStyle: self.currentBrushStyle,
        background: self.background,
        zoom: self.zoom,
        panX: self.panX,
        panY: self.panY,
        brushSettings: {
          thinning: self.brushSettings.thinning,
          smoothing: self.brushSettings.smoothing,
          streamline: self.brushSettings.streamline,
        },
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

      self.currentColor = state.currentColor;
      self.currentSize = state.currentSize;
      self.currentBrushStyle = state.currentBrushStyle as any;
      self.background = state.background as any;
      self.zoom = state.zoom;
      self.panX = state.panX;
      self.panY = state.panY;
      if (state.brushSettings) {
        self.brushSettings.thinning = state.brushSettings.thinning;
        self.brushSettings.smoothing = state.brushSettings.smoothing;
        self.brushSettings.streamline = state.brushSettings.streamline;
      }

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
      setBrushStyle(
        style:
          | "ink"
          | "marker"
          | "brush"
          | "calligraphy"
          | "pencil"
          | "eraser"
          | "spray"
          | "texture"
      ) {
        self.currentBrushStyle = style;
      },
      setPenSize(size: number) {
        self.currentSize = Math.max(1, Math.min(50, size));
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
        }>
      ) {
        if (settings.thinning !== undefined)
          self.brushSettings.thinning = settings.thinning;
        if (settings.smoothing !== undefined)
          self.brushSettings.smoothing = settings.smoothing;
        if (settings.streamline !== undefined)
          self.brushSettings.streamline = settings.streamline;
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
    };
  });

// Export type aliases for backward compatibility
export type BrushStyle =
  | "ink"
  | "marker"
  | "brush"
  | "calligraphy"
  | "pencil"
  | "eraser"
  | "spray"
  | "texture";
export type BackgroundType = "white" | "transparent" | "grid";

export interface ICanvasModel extends Instance<typeof CanvasModel> {}
export interface IStroke extends Instance<typeof Stroke> {}
export interface IPoint extends Instance<typeof Point> {}

export default CanvasModel;
