import { overlayAccent, overlayAccentFill } from "./render/overlayColor";
import { GridRenderer } from "./GridRenderer";
import { BlobStorageService } from "@/services/BlobStorageService";
import { transformController } from "./TransformController";
import { brushRegistry, registerDefaultBrushes } from "./render/BrushRegistry";
import { renderStroke } from "./render/renderStroke";
import { renderShape } from "./render/renderShape";
import { renderDrawLayer } from "./render/renderDrawLayer";
import { buildElementLookup, type ElementLookup } from "./render/lookup";
import { measureText, onFontsReady } from "./render/fonts";
import { renderArrow } from "./render/renderArrow";
import { bindableBox, boxCorners, freeTextBox, isBindable, resolveArrow } from "./geometry";
import { renderArrowHandles } from "./arrowHandles";
import { drawImageLayer } from "./render/renderImage";
import {
  installBrushAssetLoader,
  onBrushAssetsChanged,
} from "./stamp/assets";
import type {
  ArrowElementLike,
  ElementLike,
  EngineConfig,
  PanZoom,
  StrokeLike,
  LayerLike,
  ImageLayerLike,
  ShapeElementLike,
  TransformableLayer,
  PageRect,
} from "./types";
import { elementKind, isShapeElement } from "./types";
import { LayerTiles, Scheduler, TileCache, TILE, changedIds, type Tile, type TileView } from "./tiles";

const MB = 1024 * 1024;

function tileBudgetBytes() {
  const small =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || window.screen.width < 1024);
  return (small ? 96 : 160) * MB;
}

function sameIds(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export class CanvasEngine {
  // Main display canvases
  private bg: HTMLCanvasElement; // Background (white/grid/transparent)
  private display: HTMLCanvasElement; // Final composited result (renamed from fg)
  private ui: HTMLCanvasElement;
  private lookup: ElementLookup = new Map();
  private hidden: string | null = null;

  private bgCtx: CanvasRenderingContext2D;
  private displayCtx: CanvasRenderingContext2D;
  private uiCtx: CanvasRenderingContext2D;

  private tileCache = new TileCache(tileBudgetBytes());
  private scheduler = new Scheduler();
  private tiles: Map<string, LayerTiles> = new Map();
  private tilesSeen: Map<string, number> = new Map();
  private prevElements: Map<string, readonly ElementLike[]> = new Map();
  private prevPending = new Set<string>();
  private prevHidden: string | null = null;
  private pending: Set<string> | undefined;
  private lastZoomChange = -Infinity;
  private frameNo = 0;
  private tileDebug = false;
  private stopFontListener: (() => void) | null = null;
  private static readonly VIEW_SETTLE_MS = 150;
  private static readonly REVEAL_MS = 450;
  private static readonly HIDDEN_LAYER_TTL_MS = 30000;
  private lastViewChange = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private stopAssetListener: () => void = () => {};
  private resizeObserver: ResizeObserver | null = null;

  // Image cache for rendering image layers
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private loadingImages: Set<string> = new Set();

  private pz: PanZoom = { panX: 0, panY: 0, zoom: 1 };
  private grid = new GridRenderer();
  private rafId: number | null = null;
  private invalid = true;
  private background: EngineConfig["background"];
  private page: PageRect | null = null;
  private surround = "#D9D7D2";
  private surroundDark = false;
  private checker: CanvasPattern | null = null;
  private preview: StrokeLike | null = null;
  private previewShape: ShapeElementLike | null = null;
  private previewArrow: ArrowElementLike | null = null;
  private bindHighlight: string | null = null;
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
    installBrushAssetLoader();
    this.stopAssetListener = onBrushAssetsChanged(() => {
      for (const t of this.tiles.values()) t.markAllStale();
      this.invalidate();
    });
    this.stopFontListener = onFontsReady(() => {
      for (const t of this.tiles.values()) t.markAllStale();
      this.invalidate();
    });
    try {
      this.tileDebug = localStorage.getItem("zk-debug-tiles") === "1";
    } catch {
      this.tileDebug = false;
    }
    this.resize();
    window.addEventListener("resize", this.resize);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
        this.render();
        this.invalid = false;
      });
      this.resizeObserver.observe(this.root);
    }
    this.loop();
  }

  destroy = () => {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.stopAssetListener();
    this.stopFontListener?.();
    window.removeEventListener("resize", this.resize);
    this.resizeObserver?.disconnect();
    this.bg.remove();
    this.display.remove();
    this.ui.remove();

    for (const t of this.tiles.values()) t.dispose();
    this.tiles.clear();
    this.scheduler.cancel("");
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
      if (next.zoom !== this.pz.zoom) this.lastZoomChange = this.lastViewChange;
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.invalidate();
      }, CanvasEngine.VIEW_SETTLE_MS);
    }
    this.pz = next;
    this.invalidate();
  }

  setBackground(bg: EngineConfig["background"]) {
    this.background = bg;
    this.invalidate();
  }
  setPage(page: PageRect | null) {
    this.page = page ? { ...page } : null;
    this.invalidate();
  }
  setSurround(color: string, dark: boolean) {
    this.surround = color;
    this.surroundDark = dark;
    this.invalidate();
  }
  private pageOnScreen() {
    const p = this.page!;
    const { panX, panY, zoom } = this.pz;
    return { x: panX + p.x * zoom, y: panY + p.y * zoom, width: p.width * zoom, height: p.height * zoom };
  }
  setPreviewStroke(s: StrokeLike | null) {
    this.preview = s;
    this.invalidate();
  }
  setPreviewShape(s: ShapeElementLike | null) {
    this.previewShape = s;
    this.invalidate();
  }
  setPreviewArrow(a: ArrowElementLike | null) {
    this.previewArrow = a;
    this.invalidate();
  }
  setBindHighlight(id: string | null) {
    if (this.bindHighlight === id) return;
    this.bindHighlight = id;
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
    if (this.scheduler.pending) {
      const busy = performance.now() - this.lastViewChange < CanvasEngine.VIEW_SETTLE_MS;
      if (this.scheduler.run(busy ? 6 : 10) > 0) this.invalid = true;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  setTileDebug(on: boolean) {
    this.tileDebug = on;
    this.invalidate();
  }

  private render() {
    this.renderBackground();
    this.renderStrokes();
    this.renderOverlay();
    if (this.tileDebug) this.renderTileDebug();
  }

  private renderTileDebug() {
    const dpr = window.devicePixelRatio || 1;
    const ox = Math.round(dpr * this.pz.panX);
    const oy = Math.round(dpr * this.pz.panY);
    const ctx = this.uiCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "rgba(255, 0, 128, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((ox % TILE) + TILE) % TILE; x < this.ui.width; x += TILE) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.ui.height);
    }
    for (let y = ((oy % TILE) + TILE) % TILE; y < this.ui.height; y += TILE) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.ui.width, y + 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 0, 128, 0.9)";
    ctx.font = "12px monospace";
    ctx.fillText(`jobs ${this.scheduler.pending}`, 8, this.ui.height - 8);
    ctx.restore();
  }

  private renderBackground() {
    const ctx = this.bgCtx;
    const c = this.bg;
    ctx.clearRect(0, 0, c.width, c.height);
    if (this.page) {
      this.renderPageBackground(ctx, c);
      return;
    }
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

  private renderPageBackground(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
    const r = this.pageOnScreen();
    ctx.fillStyle = this.surround;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.shadowColor = this.surroundDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.18)";
    ctx.shadowBlur = this.surroundDark ? 28 : 18;
    ctx.shadowOffsetY = this.surroundDark ? 8 : 4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.restore();
    if (this.background === "white") return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.clip();
    if (this.background === "grid") {
      this.grid.draw(ctx, c, this.pz, this.page!);
    } else {
      if (!this.checker) {
        const tile = document.createElement("canvas");
        tile.width = 40;
        tile.height = 40;
        const t = tile.getContext("2d")!;
        t.fillStyle = "#ffffff";
        t.fillRect(0, 0, 40, 40);
        t.fillStyle = "#f0f0f0";
        t.fillRect(20, 0, 20, 20);
        t.fillRect(0, 20, 20, 20);
        this.checker = ctx.createPattern(tile, "repeat");
      }
      if (this.checker) {
        this.checker.setTransform(new DOMMatrix().translate(r.x, r.y).scale(this.pz.zoom));
        ctx.fillStyle = this.checker;
        ctx.fillRect(r.x, r.y, r.width, r.height);
      }
    }
    ctx.restore();
  }

  private renderPageVeil() {
    if (!this.page) return;
    const dpr = window.devicePixelRatio || 1;
    const r = this.pageOnScreen();
    const ctx = this.displayCtx;
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = this.surround;
    ctx.beginPath();
    ctx.rect(0, 0, this.display.width / dpr, this.display.height / dpr);
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.fill("evenodd");
    ctx.restore();
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
    this.lookup = buildElementLookup(layers as any);

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

    const dpr = window.devicePixelRatio || 1;
    const now = performance.now();
    const view: TileView = {
      originX: Math.round(dpr * this.pz.panX),
      originY: Math.round(dpr * this.pz.panY),
      scale: dpr * this.pz.zoom,
      widthPx: this.display.width,
      heightPx: this.display.height,
      zoomStable: now - this.lastZoomChange >= CanvasEngine.VIEW_SETTLE_MS,
      revealAll: now - this.lastZoomChange >= CanvasEngine.REVEAL_MS,
      frame: ++this.frameNo,
    };
    this.pending = this.config.getPendingEraserDeletes?.();
    this.hidden = this.config.getHiddenElementId?.() ?? null;

    const pendingNow = new Set(this.pending ?? []);
    const extraIds: string[] = [];
    if (!sameIds(pendingNow, this.prevPending)) {
      for (const id of pendingNow) if (!this.prevPending.has(id)) extraIds.push(id);
      for (const id of this.prevPending) if (!pendingNow.has(id)) extraIds.push(id);
      this.prevPending = pendingNow;
    }
    if (this.hidden !== this.prevHidden) {
      if (this.hidden) extraIds.push(this.hidden);
      if (this.prevHidden) extraIds.push(this.prevHidden);
      this.prevHidden = this.hidden;
    }

    const globalChanged = new Set<string>();
    const seen = new Set<string>();
    let layersWithContent = 0;
    for (const layer of layers) {
      if (layer.type !== "draw") continue;
      seen.add(layer.id);
      if (layer.elements.length) layersWithContent++;
      const prev = this.prevElements.get(layer.id);
      if (prev !== layer.elements) {
        for (const id of changedIds(prev ?? [], layer.elements)) globalChanged.add(id);
        this.prevElements.set(layer.id, layer.elements);
      }
    }
    for (const [id, els] of this.prevElements) {
      if (seen.has(id)) continue;
      if (now - (this.tilesSeen.get(id) ?? now) > CanvasEngine.HIDDEN_LAYER_TTL_MS) {
        this.tiles.get(id)?.dispose();
        this.tiles.delete(id);
        this.tilesSeen.delete(id);
        this.prevElements.delete(id);
        this.scheduler.cancel(`${id}|`);
        for (const el of els) globalChanged.add(el.id);
      }
    }
    const overviewPx = Math.max(
      512,
      Math.min(2048, Math.floor(Math.sqrt(6_000_000 / Math.max(1, layersWithContent)))),
    );

    const drawn = new Set<Tile>();
    for (const layer of layers) {
      if (!layer.visible) continue;
      this.tilesSeen.set(layer.id, now);
      const ctx = this.displayCtx;

      if (layer.type === "image" || (this.animatingLayerId === layer.id && this.animationStrokes)) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, view.originX, view.originY);
        ctx.scale(view.scale, view.scale);
        ctx.globalAlpha = layer.opacity;
        if (layer.type === "image") {
          this.renderImageLayer(ctx, layer as ImageLayerLike);
        } else {
          for (const stroke of this.animationStrokes!) {
            renderStroke(ctx, stroke, brushRegistry, this.config.getBrushOptions);
          }
        }
        ctx.restore();
        continue;
      }
      if (layer.type !== "draw") continue;

      let tiles = this.tiles.get(layer.id);
      if (!tiles) {
        tiles = new LayerTiles(this.tileCache, (c, els) =>
          renderDrawLayer(c, els, {
            getBrushOptions: this.config.getBrushOptions,
            pending: this.pending,
            lookup: this.lookup,
            hidden: this.hidden,
          }),
        );
        this.tiles.set(layer.id, tiles);
      }
      tiles.overviewPx = overviewPx;
      tiles.update(layer.elements, this.lookup, globalChanged, extraIds);
      tiles.syncVisible(view);
      tiles.schedule(view, this.scheduler, layer.id);
      for (const t of tiles.composite(ctx, view, layer.opacity)) drawn.add(t);
    }
    this.tileCache.evict(drawn);

    // Render preview stroke on top (for live drawing feedback)
    if (this.preview) {
      this.displayCtx.save();
      this.displayCtx.setTransform(1, 0, 0, 1, view.originX, view.originY);
      this.displayCtx.scale(view.scale, view.scale);
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
      this.displayCtx.setTransform(1, 0, 0, 1, view.originX, view.originY);
      this.displayCtx.scale(view.scale, view.scale);
      renderShape(this.displayCtx, this.previewShape);
      this.displayCtx.restore();
    }

    if (this.previewArrow) {
      this.displayCtx.save();
      this.displayCtx.setTransform(1, 0, 0, 1, view.originX, view.originY);
      this.displayCtx.scale(view.scale, view.scale);
      renderArrow(this.displayCtx, this.previewArrow, this.lookup, measureText, null);
      this.displayCtx.restore();
    }

    this.renderPageVeil();
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
    this.renderBindHighlight(ctx);

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
    if (refs.length > 1) {
      this.renderArrowOutlines(ctx, refs);
      return;
    }
    // When an anchor is rendering the bbox (single-stroke), no extra outline needed.
    if (this.config.getSelectionAnchor?.()) return;
    const layers = this.config.getLayers?.() || [];
    ctx.save();
    ctx.strokeStyle = overlayAccent();
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
        if (el && elementKind(el) === "arrow") continue;
        if (el) {
          element = el;
          if (elementKind(el) === "text") {
            bbox = freeTextBox(el as any, measureText);
          } else if (isShapeElement(el)) {
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

  private renderArrowOutlines(ctx: CanvasRenderingContext2D, refs: { layerId: string; elementId: string | null }[]) {
    ctx.save();
    ctx.strokeStyle = overlayAccent();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const ref of refs) {
      const el = ref.elementId ? this.lookup.get(ref.elementId) : null;
      if (!el || elementKind(el) !== "arrow") continue;
      const r = resolveArrow(el as any, this.lookup, measureText);
      const z = this.pz.zoom;
      ctx.beginPath();
      ctx.moveTo(r.start.x * z + this.pz.panX, r.start.y * z + this.pz.panY);
      ctx.quadraticCurveTo(
        r.control.x * z + this.pz.panX,
        r.control.y * z + this.pz.panY,
        r.end.x * z + this.pz.panX,
        r.end.y * z + this.pz.panY,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderBindHighlight(ctx: CanvasRenderingContext2D) {
    if (!this.bindHighlight) return;
    const el = this.lookup.get(this.bindHighlight);
    if (!isBindable(el)) return;
    const box = bindableBox(el, measureText);
    const pad = 6 / this.pz.zoom;
    const corners = boxCorners({ ...box, x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 });
    ctx.save();
    ctx.strokeStyle = overlayAccent();
    ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((p, i) => {
      const x = p.x * this.pz.zoom + this.pz.panX;
      const y = p.y * this.pz.zoom + this.pz.panY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
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
    ctx.fillStyle = overlayAccentFill();
    ctx.strokeStyle = overlayAccent();
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
      if (element && elementKind(element) === "arrow") {
        renderArrowHandles(ctx, resolveArrow(element, this.lookup, measureText), this.pz);
        return;
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
      } else if (element && elementKind(element) === "text" && !element.containerId) {
        transformable = freeTextBox(element, measureText) as TransformableLayer;
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
}
