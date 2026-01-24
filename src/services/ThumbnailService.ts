import type { IStroke } from "../models/CanvasModel";
import type { ILayerSnapshot } from "../models/LayerModel";
import { getStroke } from "perfect-freehand";
import { BlobStorageService } from "./BlobStorageService";

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
  static async generateThumbnailAsync(
    layers: ILayerSnapshot[],
    background: string,
    width = 200,
    height = 150,
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    // Set background
    this.drawBackground(ctx, background, width, height);

    // Collect all strokes and image layers from visible layers
    const visibleLayers = layers.filter((l) => l.visible !== false);

    // Calculate bounds including both strokes and images
    const bounds = this.calculateBoundsForLayers(visibleLayers);

    if (!bounds) {
      return canvas.toDataURL();
    }

    const { minX, minY, maxX, maxY, scale, offsetX, offsetY } =
      this.calculateTransform(bounds, width, height);

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
        layer.type === "stroke" &&
        "strokes" in layer &&
        layer.strokes
      ) {
        // Render strokes for this layer
        this.renderStrokes(
          ctx,
          layer.strokes as IStroke[],
          minX,
          minY,
          scale,
          offsetX,
          offsetY,
        );
      }

      ctx.globalAlpha = prevAlpha;
    }

    return canvas.toDataURL();
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

    this.renderStrokes(ctx, strokes, minX, minY, scale, offsetX, offsetY);

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
      this.drawGrid(ctx, width, height);
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
        layer.type === "stroke" &&
        "strokes" in layer &&
        layer.strokes
      ) {
        for (const stroke of layer.strokes) {
          for (const point of stroke.points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
            hasContent = true;
          }
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

  private static renderStrokes(
    ctx: CanvasRenderingContext2D,
    strokes: IStroke[],
    minX: number,
    minY: number,
    scale: number,
    offsetX: number,
    offsetY: number,
  ) {
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      const prevComposite = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = (
        stroke.brushStyle === "eraser" ? "destination-out" : "source-over"
      ) as GlobalCompositeOperation;

      // For thumbnails, keep it lightweight: draw a filled path for ink/texture and dots for spray
      if (stroke.brushStyle === "spray") {
        const prevAlpha = ctx.globalAlpha;
        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = (stroke as any).opacity ?? 1 * prevAlpha;
        const size = stroke.size * scale;
        for (let i = 0; i < stroke.points.length; i++) {
          const { x, y, pressure = 0.5 } = stroke.points[i];
          const current = size * pressure;
          const density = Math.max(2, current * 0.25);
          for (let j = 0; j < density; j++) {
            const sx =
              (x - minX) * scale +
              offsetX +
              (Math.random() - 0.5) * current * 0.8;
            const sy =
              (y - minY) * scale +
              offsetY +
              (Math.random() - 0.5) * current * 0.8;
            const r = Math.random() * 2 + 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = prevAlpha;
      } else {
        // Use perfect-freehand for accurate rendering with stroke's brush settings
        const scaledPoints = stroke.points.map((p) => [
          (p.x - minX) * scale + offsetX,
          (p.y - minY) * scale + offsetY,
          p.pressure ?? 0.5,
        ]);

        const outline = getStroke(scaledPoints, {
          size: Math.max(1, stroke.size * scale),
          thinning: (stroke as any).thinning ?? 0.5,
          smoothing: (stroke as any).smoothing ?? 0.5,
          streamline: (stroke as any).streamline ?? 0.5,
          start: { taper: (stroke as any).taperStart ?? 0 },
          end: { taper: (stroke as any).taperEnd ?? 0 },
          last: true,
        });

        if (outline.length < 3) {
          ctx.globalCompositeOperation = prevComposite;
          return;
        }

        // Convert outline to path
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.globalAlpha = (stroke as any).opacity ?? 1;

        const [first, ...rest] = outline;
        ctx.moveTo(first[0], first[1]);
        for (const [x, y] of rest) {
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalCompositeOperation = prevComposite;
    });
  }

  private static drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    const gridSize = 10;
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 0.5;

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
}
