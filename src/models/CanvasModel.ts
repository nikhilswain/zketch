import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
  getSnapshot,
  isStateTreeNode,
} from "mobx-state-tree";
import {
  Layer,
  createLayerId,
  createDefaultLayer,
  createImageLayer,
  type ILayerSnapshot,
} from "./LayerModel";
// Import shared models and re-export for backward compatibility
import { Point, Stroke, BrushSettings } from "./SharedModels";
export { Point, Stroke, BrushSettings } from "./SharedModels";

export const CanvasState = types.model("CanvasState", {
  strokes: types.array(Stroke),
  layers: types.optional(types.array(Layer), []),
  activeLayerId: types.optional(types.string, ""),
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
    // Legacy strokes array - maintained for backward compatibility
    strokes: types.optional(types.array(Stroke), []),
    // New layers system
    layers: types.optional(types.array(Layer), []),
    activeLayerId: types.optional(types.string, ""),
    // Focused layer ID - when set, only this layer is visible (solo mode)
    focusedLayerId: types.optional(types.maybeNull(types.string), null),
    // Layer display mode: "normal" shows individual layers, "flattened" shows merged result
    layerDisplayMode: types.optional(
      types.enumeration("LayerDisplayMode", ["normal", "flattened"]),
      "normal"
    ),
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
      // Check both legacy strokes and all layer strokes
      if (self.strokes.length > 0) return false;
      return self.layers.every((layer) => {
        // Only stroke layers have strokes
        if (layer.type === "stroke") {
          return (layer as any).strokes.length === 0;
        }
        // Image layers are never "empty" in the stroke sense
        return false;
      });
    },
    // Get the currently active layer
    get activeLayer() {
      return self.layers.find((l) => l.id === self.activeLayerId) || null;
    },
    // Get all layers in render order (bottom to top)
    get sortedLayers() {
      return self.layers.slice();
    },
    // Get visible layers only (respects focus mode)
    get visibleLayers() {
      // If a layer is focused, only show that one
      if (self.focusedLayerId) {
        const focused = self.layers.find((l) => l.id === self.focusedLayerId);
        return focused ? [focused] : [];
      }
      return self.layers.filter((l) => l.visible);
    },
    // Check if a specific layer is focused (solo mode)
    get isFocusMode() {
      return self.focusedLayerId !== null;
    },
    // Check if we have any layers
    get hasLayers() {
      return self.layers.length > 0;
    },
    // Get the layer count
    get layerCount() {
      return self.layers.length;
    },
    // Get flattened strokes from all visible layers (for export/preview)
    get flattenedStrokes() {
      const allStrokes: SnapshotOut<typeof Stroke>[] = [];
      for (const layer of self.layers) {
        if (layer.visible && layer.type === "stroke") {
          const strokeLayer = layer as any;
          for (const stroke of strokeLayer.strokes) {
            allStrokes.push(getSnapshot(stroke));
          }
        }
      }
      // Also include legacy strokes if any
      for (const stroke of self.strokes) {
        allStrokes.push(getSnapshot(stroke));
      }
      return allStrokes;
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
        layers: self.layers.map((layer) => {
          // Handle different layer types
          const baseLayerData = {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
          };

          if (layer.type === "stroke") {
            const strokeLayer = layer as any;
            return {
              ...baseLayerData,
              strokes: strokeLayer.strokes.map((stroke: any) => ({
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
              })),
            };
          } else if (layer.type === "image") {
            const imageLayer = layer as any;
            return {
              ...baseLayerData,
              blobId: imageLayer.blobId,
              naturalWidth: imageLayer.naturalWidth,
              naturalHeight: imageLayer.naturalHeight,
              x: imageLayer.x,
              y: imageLayer.y,
              width: imageLayer.width,
              height: imageLayer.height,
              rotation: imageLayer.rotation,
              aspectLocked: imageLayer.aspectLocked,
            };
          }
          return baseLayerData;
        }),
        activeLayerId: self.activeLayerId,
        background: self.background,
        zoom: self.zoom,
        panX: self.panX,
        panY: self.panY,
      };

      // Remove any future history if we're not at the end
      if (self.historyIndex < self.history.length - 1) {
        self.history = self.history.slice(0, self.historyIndex + 1);
      }

      self.history.push(state as any);
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

      // Update layers if present in state
      if (state.layers) {
        self.layers.replace(
          state.layers.map((layerData) => Layer.create(layerData as any))
        );
      }
      if (state.activeLayerId !== undefined) {
        self.activeLayerId = state.activeLayerId;
      }

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
        // Clear legacy strokes
        self.clearStrokes();

        // Clear all layers and reset to a single default layer
        self.layers.clear();
        self.activeLayerId = "";
        self.focusedLayerId = null;

        // Create a fresh default layer
        const defaultLayer = createDefaultLayer("Layer 1");
        self.layers.push(Layer.create(defaultLayer as any));
        self.activeLayerId = defaultLayer.id;

        self.saveToHistory();
        self.renderVersion++;
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

      // ===== Layer Management Actions =====

      // Initialize layers with a default layer if none exist
      initializeLayers() {
        if (self.layers.length === 0) {
          const defaultLayer = createDefaultLayer("Layer 1");
          self.layers.push(Layer.create(defaultLayer as any));
          self.activeLayerId = defaultLayer.id;
          self.renderVersion++;
        }
      },

      // Add a new stroke layer
      addLayer(name?: string) {
        const newLayer = createDefaultLayer(
          name || `Layer ${self.layers.length + 1}`
        );
        self.layers.push(Layer.create(newLayer as any));
        self.activeLayerId = newLayer.id;
        self.saveToHistory();
        self.renderVersion++;
        return newLayer.id;
      },

      // Add a new image layer
      addImageLayer(
        blobId: string,
        naturalWidth: number,
        naturalHeight: number,
        canvasWidth: number,
        canvasHeight: number,
        name?: string,
        centerX?: number,
        centerY?: number
      ) {
        const newLayer = createImageLayer(
          blobId,
          naturalWidth,
          naturalHeight,
          canvasWidth,
          canvasHeight,
          name ||
            `Image ${self.layers.filter((l) => l.type === "image").length + 1}`,
          centerX,
          centerY
        );
        self.layers.push(Layer.create(newLayer as any));
        self.activeLayerId = newLayer.id;
        self.saveToHistory();
        self.renderVersion++;
        return newLayer.id;
      },

      // Remove a layer by ID
      removeLayer(layerId: string) {
        const index = self.layers.findIndex((l) => l.id === layerId);
        if (index === -1) return;

        // Don't allow removing the last layer
        if (self.layers.length === 1) return;

        self.layers.splice(index, 1);

        // If we removed the active layer, select another one
        if (self.activeLayerId === layerId) {
          self.activeLayerId =
            self.layers[Math.min(index, self.layers.length - 1)]?.id || "";
        }

        self.saveToHistory();
        self.renderVersion++;
      },

      // Set the active layer
      setActiveLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          self.activeLayerId = layerId;
          self.renderVersion++;
        }
      },

      // Move layer to a new position (index)
      moveLayer(layerId: string, newIndex: number) {
        const currentIndex = self.layers.findIndex((l) => l.id === layerId);
        if (currentIndex === -1) return;
        if (newIndex < 0 || newIndex >= self.layers.length) return;
        if (currentIndex === newIndex) return;

        const [layer] = self.layers.splice(currentIndex, 1);
        self.layers.splice(newIndex, 0, layer);

        self.saveToHistory();
        self.renderVersion++;
      },

      // Move layer up (towards the top/front) - swap with the layer above
      moveLayerUp(layerId: string) {
        const currentIndex = self.layers.findIndex((l) => l.id === layerId);
        if (currentIndex === -1 || currentIndex === self.layers.length - 1)
          return;

        // Use move instead of splice to avoid detaching nodes
        // swap current layer with the one above it
        const targetIndex = currentIndex + 1;

        // Get snapshots of both layers
        const currentLayerSnapshot = getSnapshot(self.layers[currentIndex]);
        const targetLayerSnapshot = getSnapshot(self.layers[targetIndex]);

        // Replace in place to avoid detachment issues
        self.layers[currentIndex] = Layer.create(targetLayerSnapshot as any);
        self.layers[targetIndex] = Layer.create(currentLayerSnapshot as any);

        self.renderVersion++;
      },

      // Move layer down (towards the bottom/back) - swap with the layer below
      moveLayerDown(layerId: string) {
        const currentIndex = self.layers.findIndex((l) => l.id === layerId);
        if (currentIndex <= 0) return;

        const targetIndex = currentIndex - 1;

        // Get snapshots of both layers
        const currentLayerSnapshot = getSnapshot(self.layers[currentIndex]);
        const targetLayerSnapshot = getSnapshot(self.layers[targetIndex]);

        // Replace in place to avoid detachment issues
        self.layers[currentIndex] = Layer.create(targetLayerSnapshot as any);
        self.layers[targetIndex] = Layer.create(currentLayerSnapshot as any);

        self.renderVersion++;
      },

      // Rename a layer
      renameLayer(layerId: string, name: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.setName(name);
          self.renderVersion++;
        }
      },

      // Toggle layer visibility
      toggleLayerVisibility(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.toggleVisible();
          self.renderVersion++;
        }
      },

      // Focus on a single layer (solo mode) - hides all other layers temporarily
      focusLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          // Toggle focus: if already focused, unfocus; otherwise focus this layer
          if (self.focusedLayerId === layerId) {
            self.focusedLayerId = null;
          } else {
            self.focusedLayerId = layerId;
          }
          self.renderVersion++;
        }
      },

      // Unfocus layer (exit solo mode)
      unfocusLayer() {
        self.focusedLayerId = null;
        self.renderVersion++;
      },

      // Check if a specific layer is the focused one
      isLayerFocused(layerId: string) {
        return self.focusedLayerId === layerId;
      },

      // Toggle layer lock
      toggleLayerLock(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.toggleLocked();
          self.renderVersion++;
        }
      },

      // Clear all strokes from a specific layer (keeps the layer)
      clearLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer && !layer.locked && layer.type === "stroke") {
          (layer as any).clearStrokes();
          self.saveToHistory();
          self.renderVersion++;
        }
      },

      // Set layer opacity
      setLayerOpacity(layerId: string, opacity: number) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.setOpacity(opacity);
          self.renderVersion++;
        }
      },

      // Add a stroke to the active layer
      addStrokeToActiveLayer(strokeData: SnapshotIn<typeof Stroke>) {
        const activeLayer = self.layers.find(
          (l) => l.id === self.activeLayerId
        );
        // Can only add strokes to stroke layers
        if (
          activeLayer &&
          !activeLayer.locked &&
          activeLayer.type === "stroke"
        ) {
          (activeLayer as any).addStroke(strokeData);
          self.saveToHistory();
          self.renderVersion++;
        } else if (!activeLayer && self.layers.length === 0) {
          // Fallback to legacy strokes if no layers exist
          self.addStrokeToModel(strokeData);
          self.saveToHistory();
          self.renderVersion++;
        }
      },

      // Clear strokes from the active layer
      clearActiveLayer() {
        const activeLayer = self.layers.find(
          (l) => l.id === self.activeLayerId
        );
        if (
          activeLayer &&
          !activeLayer.locked &&
          activeLayer.type === "stroke"
        ) {
          (activeLayer as any).clearStrokes();
          self.saveToHistory();
          self.renderVersion++;
        }
      },

      // Duplicate a layer
      duplicateLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (!layer) return;

        const newLayerId = createLayerId();

        // Handle different layer types
        let newLayerData: any;
        if (layer.type === "stroke") {
          const strokeLayer = layer as any;
          newLayerData = {
            id: newLayerId,
            name: `${layer.name} Copy`,
            type: "stroke",
            visible: layer.visible,
            locked: false,
            opacity: layer.opacity,
            strokes: getSnapshot(strokeLayer.strokes) as any,
          };
        } else if (layer.type === "image") {
          const imageLayer = layer as any;
          newLayerData = {
            id: newLayerId,
            name: `${layer.name} Copy`,
            type: "image",
            visible: layer.visible,
            locked: false,
            opacity: layer.opacity,
            blobId: imageLayer.blobId,
            naturalWidth: imageLayer.naturalWidth,
            naturalHeight: imageLayer.naturalHeight,
            x: imageLayer.x,
            y: imageLayer.y,
            width: imageLayer.width,
            height: imageLayer.height,
            rotation: imageLayer.rotation,
            aspectLocked: imageLayer.aspectLocked,
          };
        } else {
          return;
        }

        const newLayer = Layer.create(newLayerData);
        const index = self.layers.findIndex((l) => l.id === layerId);
        self.layers.splice(index + 1, 0, newLayer);
        self.activeLayerId = newLayerId;

        self.saveToHistory();
        self.renderVersion++;
        return newLayerId;
      },

      // Merge visible stroke layers into a single layer (image layers are skipped)
      mergeVisibleLayers() {
        const visibleStrokeLayers = self.layers.filter(
          (l) => l.visible && l.type === "stroke"
        );
        if (visibleStrokeLayers.length < 2) return;

        const allStrokes: SnapshotIn<typeof Stroke>[] = [];
        for (const layer of visibleStrokeLayers) {
          const strokeLayer = layer as any;
          for (const stroke of strokeLayer.strokes) {
            allStrokes.push(getSnapshot(stroke));
          }
        }

        // Create a new merged layer
        const mergedLayerId = createLayerId();
        const mergedLayer = Layer.create({
          id: mergedLayerId,
          name: "Merged Layer",
          visible: true,
          locked: false,
          opacity: 1,
          strokes: allStrokes as any,
        });

        // Remove all visible layers and add the merged one
        const hiddenLayers = self.layers.filter((l) => !l.visible);
        self.layers.replace([
          ...hiddenLayers.map((l) => Layer.create(getSnapshot(l) as any)),
          mergedLayer,
        ]);
        self.activeLayerId = mergedLayerId;

        self.saveToHistory();
        self.renderVersion++;
        return mergedLayerId;
      },

      // Flatten all stroke layers into one (image layers are kept separate)
      flattenAllLayers() {
        if (self.layers.length < 1) return;

        const allStrokes: SnapshotIn<typeof Stroke>[] = [];
        const imageLayers: any[] = [];

        for (const layer of self.layers) {
          if (layer.visible && layer.type === "stroke") {
            const strokeLayer = layer as any;
            for (const stroke of strokeLayer.strokes) {
              allStrokes.push(getSnapshot(stroke));
            }
          } else if (layer.type === "image") {
            // Keep image layers
            imageLayers.push(Layer.create(getSnapshot(layer) as any));
          }
        }

        // Create a single flattened stroke layer
        const flattenedLayerId = createLayerId();
        const flattenedLayer = Layer.create({
          id: flattenedLayerId,
          name: "Flattened",
          type: "stroke",
          visible: true,
          locked: false,
          opacity: 1,
          strokes: allStrokes as any,
        });

        // Keep image layers and add flattened stroke layer
        self.layers.replace([...imageLayers, flattenedLayer]);
        self.activeLayerId = flattenedLayerId;

        self.saveToHistory();
        self.renderVersion++;
        return flattenedLayerId;
      },

      // Toggle layer display mode (normal vs flattened preview)
      setLayerDisplayMode(mode: "normal" | "flattened") {
        self.layerDisplayMode = mode;
        self.renderVersion++;
      },

      // Clear all layers (for new document)
      clearAllLayers() {
        self.layers.clear();
        self.activeLayerId = "";
        self.strokes.clear();
        self.focusedLayerId = null;
        self.saveToHistory();
        self.renderVersion++;
      },

      // Load layers from saved drawing data
      loadLayers(
        layersData: Array<{
          id: string;
          name: string;
          visible: boolean;
          locked: boolean;
          opacity: number;
          strokes: SnapshotIn<typeof Stroke>[];
        }>,
        activeLayerId?: string
      ) {
        // Clear existing layers
        self.layers.clear();
        self.focusedLayerId = null;

        // Add each layer from saved data
        layersData.forEach((layerData) => {
          const layer = Layer.create({
            id: layerData.id,
            name: layerData.name,
            visible: layerData.visible,
            locked: layerData.locked,
            opacity: layerData.opacity,
            strokes: layerData.strokes as any,
          });
          self.layers.push(layer);
        });

        // Set active layer
        if (activeLayerId && self.layers.find((l) => l.id === activeLayerId)) {
          self.activeLayerId = activeLayerId;
        } else if (self.layers.length > 0) {
          self.activeLayerId = self.layers[0].id;
        }

        self.saveToHistory();
        self.renderVersion++;
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
