import { getStroke } from "perfect-freehand";
import type { IStroke, BackgroundType } from "../models/CanvasModel";
import type { IExportSettings } from "../models/SettingsModel";
import { BlobStorageService } from "./BlobStorageService";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { renderDrawLayer } from "@/engine/render/renderDrawLayer";
import { buildElementLookup } from "@/engine/render/lookup";
import { ensureFonts, fontFamiliesIn } from "@/engine/render/fonts";
import { elementBounds } from "@/engine/render/elementBounds";
import { easingFn } from "@/engine/easing";
import type { Page } from "@/utils/page";

// Image layer data needed for export
export interface IExportImageLayer {
  blobId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface IExportShapeLayer {
  shapeType: "rectangle" | "circle" | "diamond" | "triangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  fillColor: string | null;
  opacity: number;
  visible: boolean;
}

// An element-data shape for export (mirrors what canvasModel.exportLayers produces).
export type IExportElement =
  | (IStroke & { shapeType?: undefined })
  | IExportShapeLayer;

// Generic layer for export (maintains z-order)
export interface IExportLayer {
  type: "draw" | "image";
  visible: boolean;
  opacity: number;
  elements?: IExportElement[];
  imageData?: IExportImageLayer;
}

export class ExportService {
  // Cache for loaded images during export
  private static imageCache = new Map<string, HTMLImageElement>();

  /**
   * Load an image from blob storage
   */
  static async loadImage(
    blobId: string,
  ): Promise<HTMLImageElement | null> {
    // Check cache first
    if (this.imageCache.has(blobId)) {
      return this.imageCache.get(blobId)!;
    }

    try {
      const blobUrl = await BlobStorageService.getBlobUrl(blobId);
      if (!blobUrl) return null;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.imageCache.set(blobId, img);
          resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = blobUrl;
      });
    } catch {
      return null;
    }
  }

  /**
   * Pre-load all images needed for export
   */
  static async preloadImages(layers: IExportLayer[]): Promise<void> {
    await ensureFonts(fontFamiliesIn(layers as any));
    const imagePromises: Promise<HTMLImageElement | null>[] = [];

    for (const layer of layers) {
      if (layer.type === "image" && layer.imageData && layer.visible) {
        imagePromises.push(this.loadImage(layer.imageData.blobId));
      }
    }

    await Promise.all(imagePromises);
  }

  static async exportToPNG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings,
    layers?: IExportLayer[],
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = width * settings.scale;
    canvas.height = height * settings.scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    // Scale context for high-resolution export
    ctx.scale(settings.scale, settings.scale);

    // Set background
    // Keep transparent if: export setting says transparent OR canvas background is transparent
    const shouldBeTransparent =
      settings.transparentBackground || background === "transparent";
    if (!shouldBeTransparent) {
      if (background === "white") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      } else if (background === "grid") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        this.drawGrid(ctx, width, height);
      }
    }

    // If we have layers, render them in order (preserves z-order with images)
    if (layers && layers.length > 0) {
      await this.preloadImages(layers);
      await this.renderLayersToCanvas(ctx, layers, width, height);
    } else {
      // Legacy: just render strokes
      const bounds = this.calculateStrokeBounds(strokes);
      const strokeCanvas = this.renderStrokesToOffscreenCanvas(
        strokes,
        bounds,
        width,
        height,
      );
      ctx.drawImage(strokeCanvas, 0, 0, width, height);
    }

    const pngUrl = canvas.toDataURL("image/png");
    this.imageCache.clear();
    return pngUrl;
  }

  static async exportToJPG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings,
    layers?: IExportLayer[],
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = width * settings.scale;
    canvas.height = height * settings.scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    // Scale context for high-resolution export
    ctx.scale(settings.scale, settings.scale);

    // JPG doesn't support transparency, always fill background
    // Use white for transparent backgrounds
    if (background === "grid") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      this.drawGrid(ctx, width, height);
    } else {
      // White background for both "white" and "transparent" (JPG can't be transparent)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    // If we have layers, render them in order (preserves z-order with images)
    if (layers && layers.length > 0) {
      await this.preloadImages(layers);
      await this.renderLayersToCanvas(ctx, layers, width, height);
    } else {
      // Legacy: just render strokes
      const bounds = this.calculateStrokeBounds(strokes);
      const strokeCanvas = this.renderStrokesToOffscreenCanvas(
        strokes,
        bounds,
        width,
        height,
      );
      ctx.drawImage(strokeCanvas, 0, 0, width, height);
    }

    const jpgUrl = canvas.toDataURL("image/jpeg", settings.quality);
    this.imageCache.clear();
    return jpgUrl;
  }

  static async exportPage(
    layers: IExportLayer[],
    page: Page,
    scale: number,
    background: BackgroundType,
    format: "png" | "jpg",
    options: { transparentBackground: boolean; quality: number },
  ): Promise<string> {
    const transparent =
      format === "png" && (options.transparentBackground || background === "transparent");
    const canvas = await this.renderPageToCanvas(layers, page, scale, background, transparent);
    const url =
      format === "png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", options.quality);
    this.imageCache.clear();
    return url;
  }

  static async renderPageToCanvas(
    layers: IExportLayer[],
    page: Page,
    scale: number,
    background: BackgroundType,
    transparent: boolean,
  ): Promise<HTMLCanvasElement> {
    const outW = Math.max(1, Math.round(page.width * scale));
    const outH = Math.max(1, Math.round(page.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    ctx.scale(outW / page.width, outH / page.height);
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      if (background === "grid") this.drawGrid(ctx, page.width, page.height);
    }
    ctx.beginPath();
    ctx.rect(0, 0, page.width, page.height);
    ctx.clip();
    ctx.translate(-page.x, -page.y);

    await this.preloadImages(layers);
    const kx = outW / page.width;
    const ky = outH / page.height;
    const lookup = buildElementLookup(layers as any);
    for (const layer of layers) {
      if (!layer.visible) continue;
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity * prevAlpha;
      if (layer.type === "draw" && layer.elements) {
        if (layer.elements.length > 0) {
          const layerCanvas = document.createElement("canvas");
          layerCanvas.width = outW;
          layerCanvas.height = outH;
          const layerCtx = layerCanvas.getContext("2d");
          if (layerCtx) {
            layerCtx.setTransform(kx, 0, 0, ky, -page.x * kx, -page.y * ky);
            renderDrawLayer(layerCtx, layer.elements as any, { lookup });
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(layerCanvas, 0, 0);
            ctx.restore();
          }
        }
      } else if (layer.type === "image" && layer.imageData) {
        await this.renderImageLayer(ctx, layer.imageData);
      }
      ctx.globalAlpha = prevAlpha;
    }
    return canvas;
  }

  /**
   * Calculate bounds that include both strokes and images
   */
  private static calculateLayerBounds(layers: IExportLayer[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasContent = false;

    const lookup = buildElementLookup(layers as any);
    for (const layer of layers) {
      if (!layer.visible) continue;

      if (layer.type === "draw" && layer.elements) {
        for (const el of layer.elements) {
          const b = elementBounds(el as any, lookup);
          if (!b) continue;
          minX = Math.min(minX, b.minX);
          minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX);
          maxY = Math.max(maxY, b.maxY);
          hasContent = true;
        }
      } else if (layer.type === "image" && layer.imageData) {
        const img = layer.imageData;
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + img.width);
        maxY = Math.max(maxY, img.y + img.height);
        hasContent = true;
      }
    }

    if (!hasContent) return null;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Render all layers to canvas in order, supporting both stroke and image layers.
   * This preserves the z-order so images can be above or below strokes.
   */
  private static async renderLayersToCanvas(
    ctx: CanvasRenderingContext2D,
    layers: IExportLayer[],
    width: number,
    height: number,
  ): Promise<void> {
    // Calculate combined bounds of all content
    const bounds = this.calculateLayerBounds(layers);

    // Calculate transform to fit content in export canvas
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      scale = Math.min(scaleX, scaleY) * 0.9; // Leave some padding

      offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
      offsetY = (height - bounds.height * scale) / 2 - bounds.minY * scale;
    }

    // Apply transform
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const lookup = buildElementLookup(layers as any);
    for (const layer of layers) {
      if (!layer.visible) continue;

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity * prevAlpha;

      if (layer.type === "draw" && layer.elements) {
        if (layer.elements.length > 0) {
          const b = bounds ?? {
            minX: 0,
            minY: 0,
            maxX: width,
            maxY: height,
            width,
            height,
          };
          const pad = 8;
          const worldX = b.minX - pad;
          const worldY = b.minY - pad;
          const offW = Math.max(1, Math.ceil(b.width + pad * 2));
          const offH = Math.max(1, Math.ceil(b.height + pad * 2));
          const layerCanvas = document.createElement("canvas");
          layerCanvas.width = Math.max(1, Math.ceil(offW * scale));
          layerCanvas.height = Math.max(1, Math.ceil(offH * scale));
          const layerCtx = layerCanvas.getContext("2d");

          if (layerCtx) {
            layerCtx.setTransform(scale, 0, 0, scale, -worldX * scale, -worldY * scale);
            renderDrawLayer(layerCtx, layer.elements as any, { lookup });
            ctx.drawImage(layerCanvas, worldX, worldY, offW, offH);
          }
        }
      } else if (layer.type === "image" && layer.imageData) {
        await this.renderImageLayer(ctx, layer.imageData);
      }

      ctx.globalAlpha = prevAlpha;
    }

    ctx.restore();
  }

  /**
   * Render a single image layer to the canvas
   */
  private static async renderImageLayer(
    ctx: CanvasRenderingContext2D,
    imageData: IExportImageLayer,
  ): Promise<void> {
    const img = await this.loadImage(imageData.blobId);
    if (!img) return;

    const { x, y, width, height, rotation, opacity } = imageData;

    ctx.save();

    // Apply opacity
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = opacity * prevAlpha;

    // Apply rotation around center
    if (rotation !== 0) {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    // Draw the image
    ctx.drawImage(img, x, y, width, height);

    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  }

  /**
   * Renders strokes to an offscreen canvas with proper eraser support.
   * Erasers use destination-out which only works correctly when erasing from
   * existing content, so we render all strokes to a separate canvas first.
   */
  private static renderStrokesToOffscreenCanvas(
    strokes: IStroke[],
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    } | null,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const strokeCanvas = document.createElement("canvas");
    strokeCanvas.width = width;
    strokeCanvas.height = height;
    const strokeCtx = strokeCanvas.getContext("2d");

    if (!strokeCtx) {
      return strokeCanvas;
    }

    // Apply transform if we have bounds
    if (bounds) {
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // Leave some padding

      const offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
      const offsetY =
        (height - bounds.height * scale) / 2 - bounds.minY * scale;

      strokeCtx.translate(offsetX, offsetY);
      strokeCtx.scale(scale, scale);
    }

    // Render all strokes - erasers will work correctly here
    this.renderStrokesToCanvas(strokeCtx, strokes);

    return strokeCanvas;
  }

  private static renderStrokesToCanvas(
    ctx: CanvasRenderingContext2D,
    strokes: IStroke[],
  ) {
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      renderStroke(ctx, stroke as any, brushRegistry);
    });
  }

  static drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const gridSize = 20;
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;

    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  static downloadFile(dataUrl: string, filename: string) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private static calculateStrokeBounds(strokes: IStroke[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null {
    if (strokes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
