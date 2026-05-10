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
  type IDrawLayer,
} from "./LayerModel";
import { createShapeElement, type ShapeKind } from "./ShapeLayerModel";
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
      "normal",
    ),
    currentColor: types.optional(types.string, "#000000"),
    currentSize: types.optional(types.number, 4),
    eraserSize: types.optional(types.number, 20),
    currentBrushStyle: types.optional(
      types.enumeration("BrushStyle", ["ink", "eraser", "spray", "texture"]),
      "ink",
    ),
    background: types.optional(
      types.enumeration("BackgroundType", ["white", "transparent", "grid"]),
      "white",
    ),
    zoom: types.optional(types.number, 1),
    panX: types.optional(types.number, 0),
    panY: types.optional(types.number, 0),
    brushSettings: types.optional(BrushSettings, {}),
    // Eraser configuration - use optimized advanced eraser for all backgrounds
    useAdvancedEraserForAllBackgrounds: types.optional(types.boolean, true),
    // Interaction mode: "draw" for normal drawing, "transform" for moving/resizing images
    interactionMode: types.optional(
      types.enumeration("InteractionMode", ["draw", "transform"]),
      "draw",
    ),
    selectedElements: types.optional(
      types.array(
        types.model("SelectedElementRef", {
          layerId: types.string,
          elementId: types.maybeNull(types.string),
        }),
      ),
      [],
    ),
    // Active tool: "pan" navigates, "select" hit-tests, "brush" draws, "shape" creates
    activeTool: types.optional(
      types.enumeration("ActiveTool", ["pan", "select", "brush", "shape"]),
      "brush",
    ),
    currentShapeType: types.optional(
      types.enumeration("ShapeKind", [
        "rectangle",
        "circle",
        "diamond",
        "triangle",
      ]),
      "rectangle",
    ),
    shapeStrokeWidth: types.optional(types.number, 4),
    shapeCornerRadius: types.optional(types.number, 8),
    shapeOpacity: types.optional(types.number, 1),
    shapeFillColor: types.optional(types.maybeNull(types.string), null),
    // Which attribute the global Color picker writes to when a shape is selected.
    colorTarget: types.optional(
      types.enumeration("ColorTarget", ["stroke", "fill"]),
      "stroke",
    ),
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
      if (self.strokes.length > 0) return false;
      return self.layers.every((layer) => {
        if (layer.type === "draw") {
          return (layer as any).elements.length === 0;
        }
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
    // Layers formatted for export — draw layers expose their elements array verbatim.
    get exportLayers() {
      return self.layers
        .map((layer) => {
          if (layer.type === "draw") {
            const drawLayer = layer as any;
            return {
              type: "draw" as const,
              visible: layer.visible,
              opacity: layer.opacity,
              elements: drawLayer.elements.map((e: any) => getSnapshot(e)),
            };
          } else if (layer.type === "image") {
            const imageLayer = layer as any;
            return {
              type: "image" as const,
              visible: layer.visible,
              opacity: layer.opacity,
              imageData: {
                blobId: imageLayer.blobId,
                x: imageLayer.x,
                y: imageLayer.y,
                width: imageLayer.width,
                height: imageLayer.height,
                rotation: imageLayer.rotation,
                opacity: imageLayer.opacity,
                visible: imageLayer.visible,
              },
            };
          }
          return null;
        })
        .filter(Boolean);
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
        if (layer.visible && layer.type === "draw") {
          const drawLayer = layer as any;
          for (const el of drawLayer.elements) {
            if (!("shapeType" in el)) {
              allStrokes.push(getSnapshot(el));
            }
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
    get selectionCount() {
      return self.selectedElements.length;
    },
    get hasSelection() {
      return self.selectedElements.length > 0;
    },
    get isMultiSelect() {
      return self.selectedElements.length > 1;
    },
    // Single-selection compat: return the single ref, else null.
    get selectedLayerId() {
      return self.selectedElements.length === 1
        ? self.selectedElements[0].layerId
        : null;
    },
    get selectedElementId() {
      return self.selectedElements.length === 1
        ? self.selectedElements[0].elementId
        : null;
    },
    isSelected(layerId: string, elementId: string | null) {
      return self.selectedElements.some(
        (s) => s.layerId === layerId && s.elementId === elementId,
      );
    },
    get selectedLayer() {
      if (self.selectedElements.length !== 1) return null;
      const ref = self.selectedElements[0];
      return self.layers.find((l) => l.id === ref.layerId) || null;
    },
    get selectedImageLayer() {
      if (self.selectedElements.length !== 1) return null;
      const ref = self.selectedElements[0];
      const layer = self.layers.find((l) => l.id === ref.layerId);
      return layer && layer.type === "image" ? layer : null;
    },
    get selectedShapeElement() {
      if (self.selectedElements.length !== 1) return null;
      const ref = self.selectedElements[0];
      if (!ref.elementId) return null;
      const layer = self.layers.find((l) => l.id === ref.layerId);
      if (!layer || layer.type !== "draw") return null;
      const element = (layer as any).findElement(ref.elementId);
      return element && "shapeType" in element ? element : null;
    },
    get selectedTransformableLayer() {
      if (self.selectedElements.length !== 1) return null;
      const ref = self.selectedElements[0];
      const layer = self.layers.find((l) => l.id === ref.layerId);
      if (!layer) return null;
      if (layer.type === "image") return layer;
      if (layer.type === "draw" && ref.elementId) {
        const element = (layer as any).findElement(ref.elementId);
        if (element && "shapeType" in element) return element;
      }
      return null;
    },
    // All selected shape elements (for bulk color / opacity edits).
    get selectedShapeElements() {
      const out: any[] = [];
      for (const ref of self.selectedElements) {
        if (!ref.elementId) continue;
        const layer = self.layers.find((l) => l.id === ref.layerId);
        if (!layer || layer.type !== "draw") continue;
        const element = (layer as any).findElement(ref.elementId);
        if (element && "shapeType" in element) out.push(element);
      }
      return out;
    },
    // Axis-aligned union of every selected element's *rotated* AABB.
    get selectionUnionBounds() {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      let any = false;
      for (const ref of self.selectedElements) {
        const layer = self.layers.find((l) => l.id === ref.layerId);
        if (!layer) continue;
        let bbox: any = null;
        if (layer.type === "image") {
          bbox = layer;
        } else if (layer.type === "draw" && ref.elementId) {
          const el = (layer as any).findElement(ref.elementId);
          if (el && "shapeType" in el) bbox = el;
        }
        if (!bbox) continue;
        any = true;
        const rot = bbox.rotation ?? 0;
        let bx = bbox.x;
        let by = bbox.y;
        let bw = bbox.width;
        let bh = bbox.height;
        if (rot) {
          const cx = bx + bw / 2;
          const cy = by + bh / 2;
          const rad = (rot * Math.PI) / 180;
          const absCos = Math.abs(Math.cos(rad));
          const absSin = Math.abs(Math.sin(rad));
          const rw = bw * absCos + bh * absSin;
          const rh = bw * absSin + bh * absCos;
          bx = cx - rw / 2;
          by = cy - rh / 2;
          bw = rw;
          bh = rh;
        }
        if (bx < minX) minX = bx;
        if (by < minY) minY = by;
        if (bx + bw > maxX) maxX = bx + bw;
        if (by + bh > maxY) maxY = by + bh;
      }
      if (!any) return null;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    },
    // Check if we're in transform mode
    get isTransformMode() {
      return self.interactionMode === "transform";
    },
    // Find a layer by ID (for selection purposes)
    findLayerById(id: string) {
      return self.layers.find((l) => l.id === id) || null;
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
          const baseLayerData = {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
          };

          if (layer.type === "draw") {
            const drawLayer = layer as any;
            return {
              ...baseLayerData,
              elements: drawLayer.elements.map((el: any) => getSnapshot(el)),
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
          Stroke.create(strokeData as SnapshotIn<typeof Stroke>),
        );
      }
    };

    const updateState = (state: SnapshotOut<typeof CanvasState>) => {
      // Replace the entire strokes array atomically to ensure proper reactivity
      self.strokes.replace(
        state.strokes.map((strokeData) => Stroke.create(strokeData)),
      );

      // Update layers if present in state
      if (state.layers) {
        self.layers.replace(
          state.layers.map((layerData) => Layer.create(layerData as any)),
        );
      }
      if (state.activeLayerId !== undefined) {
        self.activeLayerId = state.activeLayerId;
      }

      self.background = state.background as any;
      self.zoom = state.zoom;
      self.panX = state.panX;
      self.panY = state.panY;

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
      bumpRenderVersion() {
        self.renderVersion++;
      },
      addStroke(strokeData: SnapshotIn<typeof Stroke>) {
        self.addStrokeToModel(strokeData);
        self.saveToHistory();
      },
      replaceStrokes(strokes: SnapshotIn<typeof Stroke>[]) {
        self.clearStrokes();
        strokes.forEach((strokeData) => {
          self.addStrokeToModel(strokeData);
        });
        self.saveToHistory();
      },
      setBrushStyle(style: "ink" | "eraser" | "spray" | "texture") {
        self.currentBrushStyle = style;
      },
      setPenSize(size: number) {
        self.currentSize = Math.max(1, Math.min(50, size));
      },
      setEraserSize(size: number) {
        self.eraserSize = Math.max(1, Math.min(100, size));
      },
      setColor(color: string) {
        self.currentColor = color;
        const shapes = self.selectedShapeElements as any[];
        for (const shapeEl of shapes) {
          if (self.colorTarget === "fill") {
            shapeEl.setFillColor(color);
          } else {
            shapeEl.setStrokeColor(color);
          }
        }
      },
      setColorTarget(target: "stroke" | "fill") {
        self.colorTarget = target;
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
        }>,
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
            Math.min(1, settings.opacity),
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
        _eraserSize: number,
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
        radius: number,
      ): boolean {
        // Quick bounding box vs circle intersection test
        const closestX = Math.max(bounds.minX, Math.min(circleX, bounds.maxX));
        const closestY = Math.max(bounds.minY, Math.min(circleY, bounds.maxY));
        const distance = Math.sqrt(
          (circleX - closestX) ** 2 + (circleY - closestY) ** 2,
        );
        return distance <= radius;
      },
      // DEPRECATED support helpers retained for compatibility (no-op implementations)
      splitStrokeByPoint(
        _stroke: SnapshotOut<typeof Stroke>,
        _x: number,
        _y: number,
        _eraserRadius: number,
      ): SnapshotIn<typeof Stroke>[] {
        // return original stroke unchanged
        return [];
      },
      // No-op replacement for legacy splitStrokeByEraser (geometry eraser removed)
      splitStrokeByEraser(
        stroke: SnapshotOut<typeof Stroke>,
        _eraserPath: { x: number; y: number; pressure: number }[],
        _eraserSize: number,
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
        }
      },

      // Add a new stroke layer
      addLayer(name?: string) {
        const newLayer = createDefaultLayer(
          name || `Layer ${self.layers.length + 1}`,
        );
        self.layers.push(Layer.create(newLayer as any));
        self.activeLayerId = newLayer.id;
        self.saveToHistory();
        return newLayer.id;
      },

      setActiveTool(tool: "pan" | "select" | "brush" | "shape") {
        self.activeTool = tool;
        if (tool !== "select") {
          self.selectedElements.clear();
          self.interactionMode = "draw";
        }
      },
      setCurrentShapeType(t: ShapeKind) {
        self.currentShapeType = t;
      },
      setShapeStrokeWidth(w: number) {
        self.shapeStrokeWidth = Math.max(1, Math.min(50, w));
      },
      setShapeCornerRadius(r: number) {
        self.shapeCornerRadius = Math.max(0, r);
      },
      setShapeOpacity(o: number) {
        self.shapeOpacity = Math.max(0, Math.min(1, o));
      },
      setShapeFillColor(c: string | null) {
        self.shapeFillColor = c;
      },

      // Add a shape element to the active draw layer.
      // If active is an image (or none), spin up a draw layer above it and add there.
      addShape(
        shapeType: ShapeKind,
        x: number,
        y: number,
        width: number,
        height: number,
      ): { layerId: string; elementId: string } | null {
        let activeLayer = self.layers.find((l) => l.id === self.activeLayerId);
        if (!activeLayer || activeLayer.type !== "draw") {
          // Create a new draw layer above the current active layer.
          const newLayerData = createDefaultLayer(
            `Layer ${self.layers.length + 1}`,
          );
          self.layers.push(Layer.create(newLayerData as any));
          self.activeLayerId = newLayerData.id;
          activeLayer = self.layers.find((l) => l.id === newLayerData.id)!;
        }
        const drawLayer = activeLayer as IDrawLayer;
        if (drawLayer.locked) return null;
        const shapeData = createShapeElement(shapeType, x, y, width, height, {
          strokeColor: self.currentColor,
          strokeWidth: self.shapeStrokeWidth,
          cornerRadius: self.shapeCornerRadius,
          opacity: self.shapeOpacity,
          fillColor: self.shapeFillColor,
        });
        const elementId = drawLayer.addShape(shapeData);
        self.saveToHistory();
        return elementId
          ? { layerId: drawLayer.id, elementId }
          : null;
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
        centerY?: number,
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
          centerY,
        );
        self.layers.push(Layer.create(newLayer as any));
        self.activeLayerId = newLayer.id;
        self.saveToHistory();
        return newLayer.id;
      },

      removeLayer(layerId: string) {
        const index = self.layers.findIndex((l) => l.id === layerId);
        if (index === -1) return;
        if (self.layers.length === 1) return;

        self.layers.splice(index, 1);

        if (self.activeLayerId === layerId) {
          self.activeLayerId =
            self.layers[Math.min(index, self.layers.length - 1)]?.id || "";
        }
        // Drop any dangling selection refs to the removed layer.
        for (let i = self.selectedElements.length - 1; i >= 0; i--) {
          if (self.selectedElements[i].layerId === layerId) {
            self.selectedElements.splice(i, 1);
          }
        }
        if (self.selectedElements.length === 0) {
          self.interactionMode = "draw";
        }

        self.saveToHistory();
      },

      // Set the active layer
      setActiveLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          self.activeLayerId = layerId;
        }
      },

      setInteractionMode(mode: "draw" | "transform") {
        self.interactionMode = mode;
        if (mode === "draw") {
          self.selectedElements.clear();
        }
      },

      // Replace selection with a whole layer (used for image layers).
      selectLayer(layerId: string | null) {
        self.selectedElements.clear();
        if (layerId === null) {
          self.interactionMode = "draw";
          return;
        }
        const layer = self.layers.find((l) => l.id === layerId);
        if (!layer) return;
        self.selectedElements.push({ layerId, elementId: null });
        self.interactionMode = "transform";
        self.activeLayerId = layerId;
      },

      // Replace selection with a single element inside a draw layer.
      selectElement(layerId: string, elementId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (!layer) return;
        self.selectedElements.clear();
        self.selectedElements.push({ layerId, elementId });
        self.interactionMode = "transform";
        self.activeLayerId = layerId;
      },

      addToSelection(layerId: string, elementId: string | null) {
        const exists = self.selectedElements.some(
          (s) => s.layerId === layerId && s.elementId === elementId,
        );
        if (exists) return;
        self.selectedElements.push({ layerId, elementId });
        self.interactionMode = "transform";
        self.activeLayerId = layerId;
      },

      // Toggle membership — used for shift-click.
      toggleSelection(layerId: string, elementId: string | null) {
        const idx = self.selectedElements.findIndex(
          (s) => s.layerId === layerId && s.elementId === elementId,
        );
        if (idx >= 0) {
          self.selectedElements.splice(idx, 1);
          if (self.selectedElements.length === 0) {
            self.interactionMode = "draw";
          }
        } else {
          self.selectedElements.push({ layerId, elementId });
          self.interactionMode = "transform";
          self.activeLayerId = layerId;
        }
      },

      // Replace selection with everything inside a marquee rect (canvas-space AABB).
      // If `additive`, merges with existing selection (shift-marquee).
      selectInBounds(
        bounds: { x: number; y: number; width: number; height: number },
        additive: boolean,
      ) {
        if (!additive) self.selectedElements.clear();
        const bx2 = bounds.x + bounds.width;
        const by2 = bounds.y + bounds.height;
        for (const layer of self.layers) {
          if (!layer.visible || layer.locked) continue;
          if (layer.type === "image") {
            const il = layer as any;
            if (
              il.x < bx2 &&
              il.x + il.width > bounds.x &&
              il.y < by2 &&
              il.y + il.height > bounds.y
            ) {
              const exists = self.selectedElements.some(
                (s) => s.layerId === layer.id && s.elementId === null,
              );
              if (!exists) self.selectedElements.push({ layerId: layer.id, elementId: null });
            }
          } else if (layer.type === "draw") {
            for (const el of (layer as any).elements) {
              if (!("shapeType" in el)) continue;
              if (
                el.x < bx2 &&
                el.x + el.width > bounds.x &&
                el.y < by2 &&
                el.y + el.height > bounds.y
              ) {
                const exists = self.selectedElements.some(
                  (s) => s.layerId === layer.id && s.elementId === el.id,
                );
                if (!exists)
                  self.selectedElements.push({ layerId: layer.id, elementId: el.id });
              }
            }
          }
        }
        if (self.selectedElements.length > 0) {
          self.interactionMode = "transform";
        }
      },

      deselectLayer() {
        self.selectedElements.clear();
        self.interactionMode = "draw";
      },

      // Translate every selected shape element by (dx, dy). Used for group-drag.
      moveSelectedBy(dx: number, dy: number) {
        for (const ref of self.selectedElements) {
          if (!ref.elementId) {
            const layer = self.layers.find((l) => l.id === ref.layerId);
            if (layer && layer.type === "image" && !layer.locked) {
              (layer as any).move(dx, dy);
            }
            continue;
          }
          const layer = self.layers.find((l) => l.id === ref.layerId);
          if (!layer || layer.type !== "draw" || layer.locked) continue;
          const el = (layer as any).findElement(ref.elementId);
          if (el && "shapeType" in el) el.move(dx, dy);
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

      },

      // Rename a layer
      renameLayer(layerId: string, name: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.setName(name);
        }
      },

      // Toggle layer visibility
      toggleLayerVisibility(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.toggleVisible();
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
        }
      },

      // Unfocus layer (exit solo mode)
      unfocusLayer() {
        self.focusedLayerId = null;
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
        }
      },

      // Clear all strokes from a specific draw layer (keeps shapes and the layer).
      clearLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer && !layer.locked && layer.type === "draw") {
          (layer as any).clearStrokes();
          self.saveToHistory();
        }
      },

      // Set layer opacity
      setLayerOpacity(layerId: string, opacity: number) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.setOpacity(opacity);
        }
      },

      // Add a stroke to the active layer (auto-creates a draw layer if active is an image).
      addStrokeToActiveLayer(strokeData: SnapshotIn<typeof Stroke>) {
        let activeLayer = self.layers.find(
          (l) => l.id === self.activeLayerId,
        );
        if (!activeLayer && self.layers.length === 0) {
          // Fallback to legacy strokes if no layers exist
          self.addStrokeToModel(strokeData);
          self.saveToHistory();
          return;
        }
        if (!activeLayer || activeLayer.type !== "draw") {
          const newLayerData = createDefaultLayer(
            `Layer ${self.layers.length + 1}`,
          );
          self.layers.push(Layer.create(newLayerData as any));
          self.activeLayerId = newLayerData.id;
          activeLayer = self.layers.find((l) => l.id === newLayerData.id)!;
        }
        if (!activeLayer.locked) {
          (activeLayer as any).addStroke(strokeData);
          self.saveToHistory();
        }
      },

      // Clear strokes from the active layer (preserves shapes).
      clearActiveLayer() {
        const activeLayer = self.layers.find(
          (l) => l.id === self.activeLayerId,
        );
        if (
          activeLayer &&
          !activeLayer.locked &&
          activeLayer.type === "draw"
        ) {
          (activeLayer as any).clearStrokes();
          self.saveToHistory();
        }
      },

      removeElement(layerId: string, elementId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (!layer || layer.type !== "draw" || layer.locked) return;
        (layer as any).removeElement(elementId);
        const idx = self.selectedElements.findIndex(
          (s) => s.layerId === layerId && s.elementId === elementId,
        );
        if (idx >= 0) {
          self.selectedElements.splice(idx, 1);
          if (self.selectedElements.length === 0) {
            self.interactionMode = "draw";
          }
        }
        self.saveToHistory();
      },

      // Bulk-remove every selected element. Skips locked layers and image layers (those need explicit deletion).
      removeSelectedElements() {
        const refs = self.selectedElements.slice();
        let removedAny = false;
        for (const ref of refs) {
          if (!ref.elementId) continue;
          const layer = self.layers.find((l) => l.id === ref.layerId);
          if (!layer || layer.type !== "draw" || layer.locked) continue;
          (layer as any).removeElement(ref.elementId);
          removedAny = true;
        }
        self.selectedElements.clear();
        self.interactionMode = "draw";
        if (removedAny) self.saveToHistory();
      },

      // Duplicate a layer (deep-clones elements for draw layers).
      duplicateLayer(layerId: string) {
        const layer = self.layers.find((l) => l.id === layerId);
        if (!layer) return;

        const newLayerId = createLayerId();
        let newLayerData: any;
        if (layer.type === "draw") {
          const drawLayer = layer as any;
          newLayerData = {
            id: newLayerId,
            name: `${layer.name} Copy`,
            type: "draw",
            visible: layer.visible,
            locked: false,
            opacity: layer.opacity,
            elements: drawLayer.elements.map((el: any) => {
              const snap = getSnapshot(el) as any;
              return { ...snap, id: crypto.randomUUID() };
            }),
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
        return newLayerId;
      },

      // Merge visible draw layers into a single layer (image layers are skipped).
      mergeVisibleLayers() {
        const visibleDraw = self.layers.filter(
          (l) => l.visible && l.type === "draw",
        );
        if (visibleDraw.length < 2) return;

        const allElements: any[] = [];
        for (const layer of visibleDraw) {
          for (const el of (layer as any).elements) {
            allElements.push(getSnapshot(el));
          }
        }

        const mergedLayerId = createLayerId();
        const mergedLayer = Layer.create({
          id: mergedLayerId,
          name: "Merged Layer",
          type: "draw",
          visible: true,
          locked: false,
          opacity: 1,
          elements: allElements as any,
        });

        const hiddenLayers = self.layers.filter((l) => !l.visible);
        self.layers.replace([
          ...hiddenLayers.map((l) => Layer.create(getSnapshot(l) as any)),
          mergedLayer,
        ]);
        self.activeLayerId = mergedLayerId;

        self.saveToHistory();
        return mergedLayerId;
      },

      // Flatten all draw layers into one (image layers are kept separate).
      flattenAllLayers() {
        if (self.layers.length < 1) return;

        const allElements: any[] = [];
        const imageLayers: any[] = [];

        for (const layer of self.layers) {
          if (layer.visible && layer.type === "draw") {
            for (const el of (layer as any).elements) {
              allElements.push(getSnapshot(el));
            }
          } else if (layer.type === "image") {
            imageLayers.push(Layer.create(getSnapshot(layer) as any));
          }
        }

        const flattenedLayerId = createLayerId();
        const flattenedLayer = Layer.create({
          id: flattenedLayerId,
          name: "Flattened",
          type: "draw",
          visible: true,
          locked: false,
          opacity: 1,
          elements: allElements as any,
        });

        self.layers.replace([...imageLayers, flattenedLayer]);
        self.activeLayerId = flattenedLayerId;

        self.saveToHistory();
        return flattenedLayerId;
      },

      // Toggle layer display mode (normal vs flattened preview)
      setLayerDisplayMode(mode: "normal" | "flattened") {
        self.layerDisplayMode = mode;
      },

      // Clear all layers (for new document)
      clearAllLayers() {
        self.layers.clear();
        self.activeLayerId = "";
        self.strokes.clear();
        self.focusedLayerId = null;
        self.saveToHistory();
      },

      // Load layers from saved drawing data.
      // Migrates legacy "stroke" and "shape" layer entries into the new draw-layer model.
      loadLayers(
        layersData: Array<{
          id: string;
          name: string;
          type?: string;
          visible: boolean;
          locked: boolean;
          opacity: number;
          // New draw layer
          elements?: any[];
          // Legacy stroke layer
          strokes?: SnapshotIn<typeof Stroke>[];
          // Image layer
          blobId?: string;
          naturalWidth?: number;
          naturalHeight?: number;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          rotation?: number;
          aspectLocked?: boolean;
          // Legacy shape layer
          shapeType?: ShapeKind;
          strokeColor?: string;
          strokeWidth?: number;
          cornerRadius?: number;
          fillColor?: string | null;
        }>,
        activeLayerId?: string,
      ) {
        self.layers.clear();
        self.focusedLayerId = null;

        layersData.forEach((layerData) => {
          const layerType = layerData.type || "draw";

          if (layerType === "image") {
            const layer = Layer.create({
              id: layerData.id,
              name: layerData.name,
              type: "image",
              visible: layerData.visible,
              locked: layerData.locked,
              opacity: layerData.opacity,
              blobId: layerData.blobId!,
              naturalWidth: layerData.naturalWidth!,
              naturalHeight: layerData.naturalHeight!,
              x: layerData.x ?? 0,
              y: layerData.y ?? 0,
              width: layerData.width!,
              height: layerData.height!,
              rotation: layerData.rotation ?? 0,
              aspectLocked: layerData.aspectLocked ?? true,
            });
            self.layers.push(layer);
          } else if (layerType === "draw") {
            const layer = Layer.create({
              id: layerData.id,
              name: layerData.name,
              type: "draw",
              visible: layerData.visible,
              locked: layerData.locked,
              opacity: layerData.opacity,
              elements: (layerData.elements || []) as any,
            });
            self.layers.push(layer);
          } else if (layerType === "shape") {
            // Legacy shape layer → draw layer with one shape element.
            const layer = Layer.create({
              id: layerData.id,
              name: layerData.name,
              type: "draw",
              visible: layerData.visible,
              locked: layerData.locked,
              opacity: layerData.opacity,
              elements: [
                {
                  id: `shape_${layerData.id}`,
                  shapeType: layerData.shapeType ?? "rectangle",
                  x: layerData.x ?? 0,
                  y: layerData.y ?? 0,
                  width: layerData.width!,
                  height: layerData.height!,
                  rotation: layerData.rotation ?? 0,
                  strokeColor: layerData.strokeColor ?? "#000000",
                  strokeWidth: layerData.strokeWidth ?? 4,
                  cornerRadius: layerData.cornerRadius ?? 8,
                  fillColor: layerData.fillColor ?? null,
                  opacity: 1,
                },
              ] as any,
            });
            self.layers.push(layer);
          } else {
            // Legacy "stroke" layer → draw layer with strokes as elements.
            const layer = Layer.create({
              id: layerData.id,
              name: layerData.name,
              type: "draw",
              visible: layerData.visible,
              locked: layerData.locked,
              opacity: layerData.opacity,
              elements: (layerData.strokes || []) as any,
            });
            self.layers.push(layer);
          }
        });

        if (activeLayerId && self.layers.find((l) => l.id === activeLayerId)) {
          self.activeLayerId = activeLayerId;
        } else if (self.layers.length > 0) {
          self.activeLayerId = self.layers[0].id;
        }

        self.saveToHistory();
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
