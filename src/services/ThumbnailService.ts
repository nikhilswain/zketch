import type { IStroke } from "../models/CanvasModel";
import type { ILayerSnapshot } from "../models/LayerModel";
import { BlobStorageService } from "./BlobStorageService";
import { GridRenderer } from "@/engine/GridRenderer";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { renderDrawLayer } from "@/engine/render/renderDrawLayer";
import { buildElementLookup } from "@/engine/render/lookup";
import { ensureFonts, fontFamiliesIn } from "@/engine/render/fonts";
import { elementBounds } from "@/engine/render/elementBounds";
import type { Page } from "@/utils/page";

interface ImageLayerData {
  type: "image";
  blobId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ThumbnailService {
  /**
   * Generate thumbnail synchronously (strokes only - legacy)
   */
  static generateThumbnail(
    strokes: IStroke[],
    background: string,
    width = 200,
    height = 150,
  ): string {
    return this.generateThumbnailSync(strokes, [], background, width, height);
  }

  /**
   * Generate thumbnail asynchronously with image layer support
   */
  static async generateThumbnailBlob(
    layers: ILayerSnapshot[],
    background: string,
    width = 200,
    height = 150,
    page: Page | null = null,
  ): Promise<Blob> {
    if (page) {
      const long = 300;
      width = page.width >= page.height ? long : Math.max(1, Math.round((long * page.width) / page.height));
      height = page.width >= page.height ? Math.max(1, Math.round((long * page.height) / page.width)) : long;
    }
    const SS = 3;
    const work = document.createElement("canvas");
    work.width = width * SS;
    work.height = height * SS;
    const workCtx = work.getContext("2d");
    if (!workCtx) return new Blob([], { type: "image/png" });

    await this.renderThumbnail(
      workCtx,
      work,
      layers,
      background,
      width * SS,
      height * SS,
      page,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(work, 0, 0, width, height);
    }
    return new Promise((resolve) =>
      (ctx ? canvas : work).toBlob(
        (blob) => resolve(blob ?? new Blob([], { type: "image/png" })),
        "image/png",
      ),
    );
  }

  private static async renderThumbnail(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    layers: ILayerSnapshot[],
    background: string,
    width: number,
    height: number,
    page: Page | null = null,
  ): Promise<void> {
    // Set background
    this.drawBackground(ctx, background, width, height);

    // Collect all strokes and image layers from visible layers
    const visibleLayers = layers.filter((l) => l.visible !== false);
    await ensureFonts(fontFamiliesIn(visibleLayers as any));

    // Calculate bounds including both strokes and images
    const bounds = page ? null : this.calculateBoundsForLayers(visibleLayers);

    if (!page && !bounds) {
      return;
    }

    const { minX, minY, scale, offsetX, offsetY } = page
      ? {
          minX: 0,
          minY: 0,
          scale: width / page.width,
          offsetX: (-page.x * width) / page.width,
          offsetY: (-page.y * width) / page.width,
        }
      : this.calculateTransform(bounds!, width, height);

    // Load all images first
    const imageCache = new Map<string, HTMLImageElement>();
    for (const layer of visibleLayers) {
      if (layer.type === "image" && layer.blobId) {
        try {
          const url = await BlobStorageService.getBlobUrl(layer.blobId);
          if (url) {
            const img = await this.loadImage(url);
            imageCache.set(layer.blobId, img);
          }
        } catch (e) {
          console.warn("Failed to load image for thumbnail:", e);
        }
      }
    }

    // Render layers in order
    const lookup = buildElementLookup(visibleLayers as any);
    for (const layer of visibleLayers) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity ?? 1;

      if (layer.type === "image" && layer.blobId) {
        const img = imageCache.get(layer.blobId);
        if (img) {
          const x = ((layer.x ?? 0) - minX) * scale + offsetX;
          const y = ((layer.y ?? 0) - minY) * scale + offsetY;
          const w = (layer.width ?? img.width) * scale;
          const h = (layer.height ?? img.height) * scale;

          ctx.save();
          if (layer.rotation) {
            const cx = x + w / 2;
            const cy = y + h / 2;
            ctx.translate(cx, cy);
            ctx.rotate((layer.rotation * Math.PI) / 180);
            ctx.translate(-cx, -cy);
          }
          ctx.drawImage(img, x, y, w, h);
          ctx.restore();
        }
      } else if (
        layer.type === "draw" &&
        "elements" in layer &&
        Array.isArray((layer as any).elements)
      ) {
        const elements = (layer as any).elements;

        const off = document.createElement("canvas");
        off.width = canvas.width;
        off.height = canvas.height;
        const offCtx = off.getContext("2d");
        if (offCtx) {
          offCtx.save();
          offCtx.translate(offsetX, offsetY);
          offCtx.scale(scale, scale);
          renderDrawLayer(offCtx, elements, { lookup });
          offCtx.restore();
          ctx.drawImage(off, 0, 0);
        }
      }

      ctx.globalAlpha = prevAlpha;
    }
  }

  /**
   * Synchronous thumbnail generation (strokes only)
   */
  private static generateThumbnailSync(
    strokes: IStroke[],
    _imageLayers: ImageLayerData[],
    background: string,
    width: number,
    height: number,
  ): string {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    this.drawBackground(ctx, background, width, height);

    if (strokes.length === 0) {
      return canvas.toDataURL();
    }

    // Calculate bounds of all strokes
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY;

    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });

    // Add padding
    const padding = 0.1;
    const strokeWidth = maxX - minX;
    const strokeHeight = maxY - minY;
    minX -= strokeWidth * padding;
    minY -= strokeHeight * padding;
    maxX += strokeWidth * padding;
    maxY += strokeHeight * padding;

    // Calculate scale to fit thumbnail
    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up

    // Center the drawing
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    for (const stroke of strokes) {
      if (stroke.points.length >= 2) {
        renderStroke(ctx, stroke as any, brushRegistry);
      }
    }
    ctx.restore();

    return canvas.toDataURL();
  }

  private static drawBackground(
    ctx: CanvasRenderingContext2D,
    background: string,
    width: number,
    height: number,
  ) {
    if (background === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    } else if (background === "grid") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      new GridRenderer(20).draw(ctx, ctx.canvas, { panX: 0, panY: 0, zoom: 1 });
    } else {
      // Transparent background - add a subtle border
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, width, height);
    }
  }

  private static calculateBoundsForLayers(layers: ILayerSnapshot[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY;

    let hasContent = false;
    const lookup = buildElementLookup(layers as any);

    for (const layer of layers) {
      if (layer.type === "image") {
        const x = layer.x ?? 0;
        const y = layer.y ?? 0;
        const w = layer.width ?? 0;
        const h = layer.height ?? 0;
        if (w > 0 && h > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
          hasContent = true;
        }
      } else if (
        layer.type === "draw" &&
        "elements" in layer &&
        Array.isArray((layer as any).elements)
      ) {
        for (const el of (layer as any).elements) {
          const b = elementBounds(el, lookup);
          if (!b) continue;
          minX = Math.min(minX, b.minX);
          minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX);
          maxY = Math.max(maxY, b.maxY);
          hasContent = true;
        }
      }
    }

    if (!hasContent) return null;

    // Add padding
    const padding = 0.1;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    minX -= contentWidth * padding;
    minY -= contentHeight * padding;
    maxX += contentWidth * padding;
    maxY += contentHeight * padding;

    return { minX, minY, maxX, maxY };
  }

  private static calculateTransform(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    width: number,
    height: number,
  ) {
    const { minX, minY, maxX, maxY } = bounds;
    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY, 1);
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    return { minX, minY, maxX, maxY, scale, offsetX, offsetY };
  }

  private static loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

}
