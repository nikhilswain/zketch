import { FreehandBrush } from "./brushes/FreehandBrush";
import { SprayBrush } from "./brushes/SprayBrush";
import { TextureBrush } from "./brushes/TextureBrush";
import { GridRenderer } from "./GridRenderer";
import { BlobStorageService } from "@/services/BlobStorageService";
import { transformController } from "./TransformController";
import type {
  EngineConfig,
  PanZoom,
  StrokeLike,
  BrushOptions,
  LayerLike,
  Brush,
  ImageLayerLike,
} from "./types";

class BrushRegistry {
  private brushes = new Map<string, Brush>();
  register(b: Brush) {
    this.brushes.set(b.key, b);
  }
  get(k: string) {
    return this.brushes.get(k);
  }
}

export class CanvasEngine {
  // Main display canvases
  private bg: HTMLCanvasElement; // Background (white/grid/transparent)
  private display: HTMLCanvasElement; // Final composited result (renamed from fg)
  private ui: HTMLCanvasElement;

  private bgCtx: CanvasRenderingContext2D;
  private displayCtx: CanvasRenderingContext2D;
  private uiCtx: CanvasRenderingContext2D;

  // Offscreen layer canvases - one per layer for true isolation
  private layerCanvases: Map<string, HTMLCanvasElement> = new Map();
  private layerContexts: Map<string, CanvasRenderingContext2D> = new Map();

  // Track which layers need re-rendering (dirty tracking)
  private dirtyLayers: Set<string> = new Set();
  private lastLayerVersions: Map<string, number> = new Map();

  // Image cache for rendering image layers
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private loadingImages: Set<string> = new Set();

  private pz: PanZoom = { panX: 0, panY: 0, zoom: 1 };
  private registry = new BrushRegistry();
  private grid = new GridRenderer();
  private rafId: number | null = null;
  private invalid = true;
  private background: EngineConfig["background"];
  private preview: StrokeLike | null = null;
  private cursor: { visible: boolean; x?: number; y?: number; r?: number } = {
    visible: false,
  };

  constructor(private root: HTMLElement, private config: EngineConfig) {
    this.bg = document.createElement("canvas");
    this.display = document.createElement("canvas");
    this.ui = document.createElement("canvas");

    Object.assign(this.bg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    Object.assign(this.display.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    Object.assign(this.ui.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });

    this.root.appendChild(this.bg);
    this.root.appendChild(this.display);
    this.root.appendChild(this.ui);

    this.bgCtx = this.bg.getContext("2d", { alpha: false })!;
    this.displayCtx = this.display.getContext("2d", { alpha: true })!;
    this.uiCtx = this.ui.getContext("2d", { alpha: true })!;

    this.background = config.background;

    // Register brushes
    this.registry.register(new FreehandBrush());
    this.registry.register(new SprayBrush());
    this.registry.register(new TextureBrush());
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop();
  }

  destroy = () => {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.resize);
    this.bg.remove();
    this.display.remove();
    this.ui.remove();

    // Clean up layer canvases
    this.layerCanvases.clear();
    this.layerContexts.clear();
    this.dirtyLayers.clear();
    this.lastLayerVersions.clear();

    // Clean up image cache
    this.imageCache.clear();
    this.loadingImages.clear();
  };

  setPanZoom(p: Partial<PanZoom>) {
    this.pz = { ...this.pz, ...p };
    this.invalidate();
  }
  setBackground(bg: EngineConfig["background"]) {
    this.background = bg;
    this.invalidate();
  }
  setPreviewStroke(s: StrokeLike | null) {
    this.preview = s;
    this.invalidate();
  }
  setCursor(c: { visible: boolean; x?: number; y?: number; r?: number }) {
    this.cursor = c;
    this.invalidate();
  }
  invalidate = () => {
    this.invalid = true;
    this.config.onInvalidate?.();
  };

  private resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.root.getBoundingClientRect();
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);

    // Resize all canvases
    for (const canvas of [this.bg, this.display, this.ui]) {
      canvas.width = w;
      canvas.height = h;
    }

    // Resize offscreen layer canvases
    this.resizeLayerCanvases(w, h);

    // Apply scaling for high DPI
    this.bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.uiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Also scale layer contexts
    for (const ctx of this.layerContexts.values()) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.invalid = true;
  };

  private loop = () => {
    if (this.invalid) {
      this.render();
      this.invalid = false;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private render() {
    this.renderBackground();
    this.renderStrokes();
    this.renderOverlay();
  }

  private renderBackground() {
    const ctx = this.bgCtx;
    const c = this.bg;
    ctx.clearRect(0, 0, c.width, c.height);
    if (this.background === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    } else if (this.background === "grid") {
      this.grid.draw(ctx, c, this.pz);
    }
  }

  private renderStrokes() {
    const layers = this.config.getLayers?.() || [];

    // Clear the display canvas
    this.displayCtx.clearRect(0, 0, this.display.width, this.display.height);

    if (layers.length === 0) {
      // Legacy mode: render strokes directly (no layers)
      const strokes = this.config.getStrokes();
      this.displayCtx.save();
      this.displayCtx.translate(this.pz.panX, this.pz.panY);
      this.displayCtx.scale(this.pz.zoom, this.pz.zoom);

      for (const stroke of strokes) {
        this.renderStroke(this.displayCtx, stroke, 1);
      }
      this.displayCtx.restore();
      return;
    }

    // Get active layer IDs and clean up old canvases
    const activeLayerIds = layers.map((l) => l.id);
    this.cleanupLayerCanvases(activeLayerIds);

    // Render each layer to its own offscreen canvas, then composite
    for (const layer of layers) {
      if (!layer.visible) continue;

      const layerCtx = this.getLayerContext(layer.id);
      const layerCanvas = this.getLayerCanvas(layer.id);

      // Clear and render this layer
      layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      layerCtx.save();
      layerCtx.translate(this.pz.panX, this.pz.panY);
      layerCtx.scale(this.pz.zoom, this.pz.zoom);

      // Render all strokes for this layer
      this.renderLayer(layerCtx, layer);

      layerCtx.restore();

      // Composite this layer onto the display canvas with layer opacity
      this.displayCtx.save();
      this.displayCtx.globalAlpha = layer.opacity;
      this.displayCtx.drawImage(layerCanvas, 0, 0);
      this.displayCtx.restore();
    }

    // Render preview stroke on top (for live drawing feedback)
    if (this.preview) {
      this.displayCtx.save();
      this.displayCtx.translate(this.pz.panX, this.pz.panY);
      this.displayCtx.scale(this.pz.zoom, this.pz.zoom);
      this.renderStroke(this.displayCtx, this.preview, 1);
      this.displayCtx.restore();
    }
  }

  private renderLayer(ctx: CanvasRenderingContext2D, layer: LayerLike) {
    // Handle different layer types
    if (layer.type === "stroke") {
      // Stroke layer - render all strokes
      for (const stroke of layer.strokes) {
        this.renderStroke(ctx, stroke, 1); // Layer opacity applied during compositing
      }
    } else if (layer.type === "image") {
      // Image layer - render the image
      this.renderImageLayer(ctx, layer as ImageLayerLike);
    }
  }

  private renderImageLayer(
    ctx: CanvasRenderingContext2D,
    layer: ImageLayerLike
  ) {
    const { blobId, x, y, width, height, rotation } = layer;

    // Check if image is already cached
    const cachedImage = this.imageCache.get(blobId);

    if (cachedImage) {
      // Draw the cached image
      this.drawImage(ctx, cachedImage, x, y, width, height, rotation);
    } else if (!this.loadingImages.has(blobId)) {
      // Start loading the image
      this.loadingImages.add(blobId);
      this.loadImageForLayer(blobId);
    }
    // If loading, we skip rendering for now - will render on next frame after load
  }

  private async loadImageForLayer(blobId: string) {
    try {
      const blobUrl = await BlobStorageService.getBlobUrl(blobId);
      if (!blobUrl) {
        console.warn(`No blob found for blobId: ${blobId}`);
        this.loadingImages.delete(blobId);
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.imageCache.set(blobId, img);
        this.loadingImages.delete(blobId);
        // Trigger a re-render now that the image is loaded
        this.invalidate();
      };
      img.onerror = () => {
        console.error(`Failed to load image for blobId: ${blobId}`);
        this.loadingImages.delete(blobId);
      };
      img.src = blobUrl;
    } catch (error) {
      console.error(`Error loading image for blobId: ${blobId}`, error);
      this.loadingImages.delete(blobId);
    }
  }

  private drawImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number
  ) {
    ctx.save();

    if (rotation !== 0) {
      // Rotate around the center of the image
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
      ctx.drawImage(img, x, y, width, height);
    }

    ctx.restore();
  }

  private renderStroke(
    ctx: CanvasRenderingContext2D,
    s: StrokeLike,
    layerOpacity: number
  ) {
    // For eraser strokes, use destination-out composite
    const isEraser = s.brushStyle === "eraser";
    const prevComposite = ctx.globalCompositeOperation;

    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
    }

    const key = s.brushStyle === "eraser" ? "ink" : s.brushStyle;
    const brush = this.registry.get(key);
    if (!brush) return;

    const opts = this.config.getBrushOptions?.(key, s.size);
    brush.render(ctx, s, opts);

    if (isEraser) {
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  private renderOverlay() {
    const ctx = this.uiCtx;
    const c = this.ui;
    ctx.clearRect(0, 0, c.width, c.height);

    // Render transform handles if a layer is selected
    this.renderTransformHandles(ctx);

    // Render cursor overlay (eraser circle)
    if (
      !this.cursor.visible ||
      this.cursor.x == null ||
      this.cursor.y == null ||
      this.cursor.r == null
    )
      return;
    ctx.save();
    ctx.strokeStyle = "#666666";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(this.cursor.x, this.cursor.y, this.cursor.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderTransformHandles(ctx: CanvasRenderingContext2D) {
    const selectedLayerId = this.config.getSelectedLayerId?.();
    if (!selectedLayerId) return;

    const layers = this.config.getLayers?.() || [];
    const selectedLayer = layers.find((l) => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.type !== "image") return;

    const imgLayer = selectedLayer as ImageLayerLike;
    const dpr = window.devicePixelRatio || 1;

    // Use TransformController for rendering
    transformController.renderHandles(ctx, imgLayer, this.pz, dpr);
  }

  // Get or create an offscreen canvas for a layer
  private getLayerCanvas(layerId: string): HTMLCanvasElement {
    let canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = this.display.width;
      canvas.height = this.display.height;
      this.layerCanvases.set(layerId, canvas);
      const ctx = canvas.getContext("2d", { alpha: true })!;
      this.layerContexts.set(layerId, ctx);
    }
    return canvas;
  }

  private getLayerContext(layerId: string): CanvasRenderingContext2D {
    this.getLayerCanvas(layerId); // Ensure canvas exists
    return this.layerContexts.get(layerId)!;
  }

  // Resize all layer canvases when main canvas resizes
  private resizeLayerCanvases(width: number, height: number) {
    for (const [id, canvas] of this.layerCanvases) {
      canvas.width = width;
      canvas.height = height;
    }
    // Mark all layers as dirty after resize
    this.dirtyLayers = new Set(this.layerCanvases.keys());
  }

  // Clean up unused layer canvases
  private cleanupLayerCanvases(activeLayerIds: string[]) {
    const activeSet = new Set(activeLayerIds);
    for (const [id, canvas] of this.layerCanvases) {
      if (!activeSet.has(id)) {
        this.layerCanvases.delete(id);
        this.layerContexts.delete(id);
        this.lastLayerVersions.delete(id);
      }
    }
  }
}
