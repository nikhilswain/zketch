import { GridRenderer } from "./GridRenderer";
import { BlobStorageService } from "@/services/BlobStorageService";
import { transformController } from "./TransformController";
import { brushRegistry, registerDefaultBrushes } from "./render/BrushRegistry";
import { renderStroke } from "./render/renderStroke";
import { renderShape } from "./render/renderShape";
import { drawImageLayer } from "./render/renderImage";
import type {
  ElementLike,
  EngineConfig,
  PanZoom,
  StrokeLike,
  LayerLike,
  ImageLayerLike,
  ShapeElementLike,
  TransformableLayer,
} from "./types";
import { isShapeElement } from "./types";

type LayerContent = readonly ElementLike[] | string;

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
  private layerBakes: Map<
    string,
    {
      content: LayerContent;
      pending: Set<string> | undefined;
      panX: number;
      panY: number;
      zoom: number;
      animating: boolean;
    }
  > = new Map();
  private static readonly OVERSCAN_CSS_PX = 256;
  private static readonly VIEW_SETTLE_MS = 150;
  private lastViewChange = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  // Image cache for rendering image layers
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private loadingImages: Set<string> = new Set();

  private pz: PanZoom = { panX: 0, panY: 0, zoom: 1 };
  private grid = new GridRenderer();
  private rafId: number | null = null;
  private invalid = true;
  private background: EngineConfig["background"];
  private preview: StrokeLike | null = null;
  private previewShape: ShapeElementLike | null = null;
  private marquee: { x: number; y: number; width: number; height: number } | null = null;
  private cursor: { visible: boolean; x?: number; y?: number; worldRadius?: number } = {
    visible: false,
  };

  constructor(
    private root: HTMLElement,
    private config: EngineConfig,
  ) {
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
    registerDefaultBrushes();
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
    this.layerBakes.clear();
    if (this.settleTimer) clearTimeout(this.settleTimer);

    // Clean up image cache
    this.imageCache.clear();
    this.loadingImages.clear();
  };

  setPanZoom(p: Partial<PanZoom>) {
    const next = { ...this.pz, ...p };
    if (
      next.panX !== this.pz.panX ||
      next.panY !== this.pz.panY ||
      next.zoom !== this.pz.zoom
    ) {
      this.lastViewChange = performance.now();
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.invalidate();
      }, CanvasEngine.VIEW_SETTLE_MS);
    }
    this.pz = next;
    this.invalidate();
  }

  private overscanDevicePx() {
    const dpr = window.devicePixelRatio || 1;
    return Math.round(CanvasEngine.OVERSCAN_CSS_PX * dpr);
  }

  private bakeCoversView(
    bake: { panX: number; panY: number; zoom: number },
    margin: number,
    viewW: number,
    viewH: number,
  ) {
    const k = this.pz.zoom / bake.zoom;
    if (k < 0.5 || k > 3) return false;
    const left = this.pz.panX - (margin + bake.panX) * k;
    const top = this.pz.panY - (margin + bake.panY) * k;
    const right = this.pz.panX + (viewW + margin - bake.panX) * k;
    const bottom = this.pz.panY + (viewH + margin - bake.panY) * k;
    return left <= 0 && top <= 0 && right >= viewW && bottom >= viewH;
  }
  setBackground(bg: EngineConfig["background"]) {
    this.background = bg;
    this.invalidate();
  }
  setPreviewStroke(s: StrokeLike | null) {
    this.preview = s;
    this.invalidate();
  }
  setPreviewShape(s: ShapeElementLike | null) {
    this.previewShape = s;
    this.invalidate();
  }
  setCursor(c: { visible: boolean; x?: number; y?: number; worldRadius?: number }) {
    this.cursor = c;
    this.invalidate();
  }
  setMarquee(rect: { x: number; y: number; width: number; height: number } | null) {
    this.marquee = rect;
    this.invalidate();
  }

  // Animation state
  private animatingLayerId: string | null = null;
  private animationStrokes: StrokeLike[] | null = null;

  /**
   * Set the animation state - when a layer is being animated, render these strokes instead
   */
  setAnimationState(layerId: string | null, strokes: StrokeLike[] | null) {
    this.animatingLayerId = layerId;
    this.animationStrokes = strokes;
    this.invalidate();
  }

  /**
   * Check if a layer is currently being animated
   */
  isLayerAnimating(layerId: string): boolean {
    return this.animatingLayerId === layerId;
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
    } else if (this.background === "transparent") {
      // Draw checkerboard pattern to indicate transparency
      this.drawCheckerboard(ctx, c.width, c.height);
    }
  }

  private drawCheckerboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const size = 20; // Size of each checker square
    const lightColor = "#ffffff";
    const darkColor = "#f0f0f0";

    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        const isLight = (x / size + y / size) % 2 === 0;
        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, size, size);
      }
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
        renderStroke(
          this.displayCtx,
          stroke,
          brushRegistry,
          this.config.getBrushOptions,
        );
      }
      this.displayCtx.restore();
      return;
    }

    // Get active layer IDs and clean up old canvases
    const activeLayerIds = layers.map((l) => l.id);
    this.cleanupLayerCanvases(activeLayerIds);

    const dpr = window.devicePixelRatio || 1;
    const pending = this.config.getPendingEraserDeletes?.();

    const margin = this.overscanDevicePx() / dpr;
    const viewW = this.display.width / dpr;
    const viewH = this.display.height / dpr;
    const settling =
      performance.now() - this.lastViewChange < CanvasEngine.VIEW_SETTLE_MS;
    const { panX, panY, zoom } = this.pz;

    for (const layer of layers) {
      if (!layer.visible) continue;

      const layerCtx = this.getLayerContext(layer.id);
      const layerCanvas = this.getLayerCanvas(layer.id);

      const isAnimating =
        this.animatingLayerId === layer.id && !!this.animationStrokes;
      const content = this.layerContentKey(layer);
      const elements = layer.type === "draw" ? layer.elements : null;
      const bake = this.layerBakes.get(layer.id);
      const sameView =
        !!bake &&
        bake.panX === panX &&
        bake.panY === panY &&
        bake.zoom === zoom;
      const sameContent =
        !!bake &&
        !isAnimating &&
        !bake.animating &&
        bake.pending === pending &&
        bake.content === content;
      const reusable =
        sameContent &&
        (sameView ||
          (settling && this.bakeCoversView(bake!, margin, viewW, viewH)));
      const appended =
        !reusable &&
        !!bake &&
        sameView &&
        !isAnimating &&
        !bake.animating &&
        bake.pending === pending &&
        this.appendedElement(bake.content, elements);

      const applyBakeTransform = () => {
        const scale = dpr * zoom;
        layerCtx.setTransform(
          scale,
          0,
          0,
          scale,
          dpr * (panX + margin),
          dpr * (panY + margin),
        );
      };

      if (appended) {
        layerCtx.save();
        applyBakeTransform();
        this.renderElement(layerCtx, appended, pending);
        layerCtx.restore();
        bake!.content = content;
      } else if (!reusable) {
        layerCtx.save();
        layerCtx.setTransform(1, 0, 0, 1, 0, 0);
        layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        applyBakeTransform();

        if (isAnimating) {
          for (const stroke of this.animationStrokes!) {
            renderStroke(
              layerCtx,
              stroke,
              brushRegistry,
              this.config.getBrushOptions,
            );
          }
        } else {
          this.renderLayer(layerCtx, layer, pending);
        }

        layerCtx.restore();
        this.layerBakes.set(layer.id, {
          content,
          pending,
          panX,
          panY,
          zoom,
          animating: isAnimating,
        });
      }

      const baked = this.layerBakes.get(layer.id)!;
      const k = zoom / baked.zoom;
      this.displayCtx.save();
      this.displayCtx.setTransform(
        k,
        0,
        0,
        k,
        dpr * (panX - (margin + baked.panX) * k),
        dpr * (panY - (margin + baked.panY) * k),
      );
      this.displayCtx.globalAlpha = layer.opacity;
      this.displayCtx.drawImage(layerCanvas, 0, 0);
      this.displayCtx.restore();
    }

    // Render preview stroke on top (for live drawing feedback)
    if (this.preview) {
      this.displayCtx.save();
      this.displayCtx.translate(this.pz.panX, this.pz.panY);
      this.displayCtx.scale(this.pz.zoom, this.pz.zoom);
      renderStroke(
        this.displayCtx,
        this.preview,
        brushRegistry,
        this.config.getBrushOptions,
      );
      this.displayCtx.restore();
    }

    if (this.previewShape) {
      this.displayCtx.save();
      this.displayCtx.translate(this.pz.panX, this.pz.panY);
      this.displayCtx.scale(this.pz.zoom, this.pz.zoom);
      renderShape(this.displayCtx, this.previewShape);
      this.displayCtx.restore();
    }
  }

  private layerContentKey(layer: LayerLike): LayerContent {
    if (layer.type === "draw") return layer.elements;
    const img = layer as ImageLayerLike;
    return `${img.blobId}|${img.x}|${img.y}|${img.width}|${img.height}|${
      img.rotation
    }|${this.imageCache.has(img.blobId)}`;
  }

  private appendedElement(
    prev: LayerContent,
    next: readonly ElementLike[] | null,
  ): ElementLike | null {
    if (!next || typeof prev === "string") return null;
    if (next.length !== prev.length + 1) return null;
    for (let i = 0; i < prev.length; i++) {
      if (next[i] !== prev[i]) return null;
    }
    const added = next[next.length - 1];
    if (!isShapeElement(added) && prev.some(isShapeElement)) return null;
    return added;
  }

  private renderElement(
    ctx: CanvasRenderingContext2D,
    el: ElementLike,
    pending: Set<string> | undefined,
  ) {
    const faded = pending?.has(el.id);
    if (faded) ctx.save(), (ctx.globalAlpha *= 0.25);
    if (isShapeElement(el)) {
      renderShape(ctx, el);
    } else {
      renderStroke(ctx, el, brushRegistry, this.config.getBrushOptions);
    }
    if (faded) ctx.restore();
  }

  private renderLayer(
    ctx: CanvasRenderingContext2D,
    layer: LayerLike,
    pending: Set<string> | undefined,
  ) {
    if (layer.type === "image") {
      this.renderImageLayer(ctx, layer as ImageLayerLike);
      return;
    }
    if (layer.type === "draw") {
      // Two-pass within a draw layer: bake strokes first (raster, with destination-out
      // for eraser strokes), then render shape elements as vectors on top.
      for (const el of layer.elements) {
        if (!isShapeElement(el)) this.renderElement(ctx, el, pending);
      }
      for (const el of layer.elements) {
        if (isShapeElement(el)) this.renderElement(ctx, el, pending);
      }
    }
  }

  private renderImageLayer(
    ctx: CanvasRenderingContext2D,
    layer: ImageLayerLike,
  ) {
    const { blobId } = layer;

    // Check if image is already cached
    const cachedImage = this.imageCache.get(blobId);

    if (cachedImage) {
      drawImageLayer(ctx, cachedImage, layer);
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

  private renderOverlay() {
    const ctx = this.uiCtx;
    const c = this.ui;
    ctx.clearRect(0, 0, c.width, c.height);

    // Selection outlines (every selected element) + transform handles (only when single).
    this.renderSelectionOutlines(ctx);
    this.renderTransformHandles(ctx);
    this.renderMarquee(ctx);

    // Render cursor overlay (eraser circle)
    if (
      !this.cursor.visible ||
      this.cursor.x == null ||
      this.cursor.y == null ||
      this.cursor.worldRadius == null
    )
      return;
    ctx.save();
    ctx.strokeStyle = "#666666";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(
      this.cursor.x,
      this.cursor.y,
      this.cursor.worldRadius * this.pz.zoom,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Visual gap between a shape's stroke and its selection rect, in screen pixels.
  private static readonly SELECTION_GAP_PX = 8;

  // Padding (in world units) for the selection rect / handles around an element.
  private selectionPaddingWorld(layer: any, element: any | null) {
    const gapWorld = CanvasEngine.SELECTION_GAP_PX / this.pz.zoom;
    if (element) {
      if (isShapeElement(element)) {
        return (element.strokeWidth ?? 0) / 2 + gapWorld;
      }
      if ((element as any).points) {
        return ((element as any).size ?? 0) / 2 + gapWorld;
      }
    }
    return gapWorld;
  }

  private renderSelectionOutlines(ctx: CanvasRenderingContext2D) {
    const refs = this.config.getSelectedElements?.() ?? [];
    if (refs.length === 0) return;
    // Multi-select: union handles already convey the selection — skip per-element outlines.
    if (refs.length > 1) return;
    // When an anchor is rendering the bbox (single-stroke), no extra outline needed.
    if (this.config.getSelectionAnchor?.()) return;
    const layers = this.config.getLayers?.() || [];
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const ref of refs) {
      const layer = layers.find((l) => l.id === ref.layerId);
      if (!layer) continue;
      let bbox: { x: number; y: number; width: number; height: number; rotation: number } | null = null;
      let element: any = null;
      if (layer.type === "image") {
        bbox = layer as any;
      } else if (layer.type === "draw" && ref.elementId) {
        const el = (layer as any).elements.find((e: any) => e.id === ref.elementId);
        if (el) {
          element = el;
          if (isShapeElement(el)) {
            bbox = el as any;
          } else if ((el as any).points && (el as any).points.length > 0) {
            // Stroke: AABB of its points (no rotation).
            const pts = (el as any).points;
            let sxMin = Infinity,
              syMin = Infinity,
              sxMax = -Infinity,
              syMax = -Infinity;
            for (const p of pts) {
              if (p.x < sxMin) sxMin = p.x;
              if (p.y < syMin) syMin = p.y;
              if (p.x > sxMax) sxMax = p.x;
              if (p.y > syMax) syMax = p.y;
            }
            bbox = {
              x: sxMin,
              y: syMin,
              width: sxMax - sxMin,
              height: syMax - syMin,
              rotation: 0,
            };
          }
        }
      }
      if (!bbox) continue;
      const pad = this.selectionPaddingWorld(layer, element);
      const ix = bbox.x - pad;
      const iy = bbox.y - pad;
      const iw = bbox.width + pad * 2;
      const ih = bbox.height + pad * 2;
      const screenX = ix * this.pz.zoom + this.pz.panX;
      const screenY = iy * this.pz.zoom + this.pz.panY;
      const screenW = iw * this.pz.zoom;
      const screenH = ih * this.pz.zoom;
      ctx.save();
      if (bbox.rotation) {
        const cx = screenX + screenW / 2;
        const cy = screenY + screenH / 2;
        ctx.translate(cx, cy);
        ctx.rotate((bbox.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.strokeRect(screenX, screenY, screenW, screenH);
      ctx.restore();
    }
    ctx.restore();
  }

  private renderMarquee(ctx: CanvasRenderingContext2D) {
    if (!this.marquee) return;
    const m = this.marquee;
    const x = m.x * this.pz.zoom + this.pz.panX;
    const y = m.y * this.pz.zoom + this.pz.panY;
    const w = m.width * this.pz.zoom;
    const h = m.height * this.pz.zoom;
    ctx.save();
    ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private renderTransformHandles(ctx: CanvasRenderingContext2D) {
    const refs = this.config.getSelectedElements?.() ?? [];
    const layers = this.config.getLayers?.() || [];
    const dpr = window.devicePixelRatio || 1;

    if (refs.length === 0) return;

    if (refs.length === 1) {
      const ref = refs[0];
      const layer = layers.find((l) => l.id === ref.layerId);
      if (!layer) return;

      let element: any = null;
      if (layer.type === "draw" && ref.elementId) {
        element = (layer as any).elements.find((e: any) => e.id === ref.elementId);
      }
      const pad = this.selectionPaddingWorld(layer, element);

      // For strokes (no own rotation field), the persistent anchor carries the bbox + rotation.
      const anchor = this.config.getSelectionAnchor?.();
      if (anchor) {
        transformController.renderHandles(ctx, anchor, this.pz, dpr, pad);
        return;
      }

      // Single shape/image — render handles around the element directly.
      let transformable: TransformableLayer | null = null;
      if (layer.type === "image") {
        transformable = layer as TransformableLayer;
      } else if (element && isShapeElement(element)) {
        transformable = element as TransformableLayer;
      }
      if (!transformable) return;
      transformController.renderHandles(ctx, transformable, this.pz, dpr, pad);
      return;
    }

    // Multi-select: use the persistent rotated anchor stored on the model.
    const anchor = this.config.getSelectionAnchor?.();
    if (!anchor) return;
    const pad = CanvasEngine.SELECTION_GAP_PX / this.pz.zoom;
    transformController.renderHandles(ctx, anchor, this.pz, dpr, pad);
  }

  // Get or create an offscreen canvas for a layer
  private getLayerCanvas(layerId: string): HTMLCanvasElement {
    let canvas = this.layerCanvases.get(layerId);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = this.display.width + 2 * this.overscanDevicePx();
      canvas.height = this.display.height + 2 * this.overscanDevicePx();
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
      canvas.width = width + 2 * this.overscanDevicePx();
      canvas.height = height + 2 * this.overscanDevicePx();
    }
    // Mark all layers as dirty after resize
    this.dirtyLayers = new Set(this.layerCanvases.keys());
    this.layerBakes.clear();
  }

  // Clean up unused layer canvases
  private cleanupLayerCanvases(activeLayerIds: string[]) {
    const activeSet = new Set(activeLayerIds);
    for (const [id, canvas] of this.layerCanvases) {
      if (!activeSet.has(id)) {
        this.layerCanvases.delete(id);
        this.layerContexts.delete(id);
        this.lastLayerVersions.delete(id);
        this.layerBakes.delete(id);
      }
    }
  }
}
