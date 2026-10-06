import { getStroke } from "perfect-freehand";
import type { IStroke, BackgroundType } from "../models/CanvasModel";
import type { IExportSettings } from "../models/SettingsModel";
import { BlobStorageService } from "./BlobStorageService";
import { brushRegistry } from "@/engine/render/BrushRegistry";
import { renderStroke } from "@/engine/render/renderStroke";
import { renderShape } from "@/engine/render/renderShape";
import { easingFn } from "@/engine/easing";

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
  private static async loadImage(
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
  private static async preloadImages(layers: IExportLayer[]): Promise<void> {
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

    return canvas.toDataURL("image/png");
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

    return canvas.toDataURL("image/jpeg", settings.quality);
  }

  static async exportToSVG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings,
  ): Promise<string> {
    const scaledWidth = width * settings.scale;
    const scaledHeight = height * settings.scale;

    let svgContent = `<svg width="${scaledWidth}" height="${scaledHeight}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scaledWidth} ${scaledHeight}">`;

    // Add background
    if (!settings.transparentBackground) {
      if (background === "white") {
        svgContent += `<rect width="100%" height="100%" fill="#ffffff"/>`;
      } else if (background === "grid") {
        svgContent += `<rect width="100%" height="100%" fill="#ffffff"/>`;
        svgContent += this.generateGridSVG(scaledWidth, scaledHeight);
      } else {
        svgContent += `<rect width="100%" height="100%" fill="#f8f9fa"/>`;
      }
    }

    // Calculate stroke bounds and scale factor
    const bounds = this.calculateStrokeBounds(strokes);
    if (bounds) {
      const scaleX = scaledWidth / bounds.width;
      const scaleY = scaledHeight / bounds.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // Leave some padding

      const offsetX =
        (scaledWidth - bounds.width * scale) / 2 - bounds.minX * scale;
      const offsetY =
        (scaledHeight - bounds.height * scale) / 2 - bounds.minY * scale;

      svgContent += `<g transform="translate(${offsetX},${offsetY}) scale(${scale})">`;
    }

    // Add strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      const path = this.generateSVGPath(stroke, width, height, 1); // Use scale 1 since we're handling scaling with transform
      svgContent += `<path d="${path}" fill="${stroke.color}" stroke="none"/>`;
    });

    if (bounds) {
      svgContent += "</g>";
    }

    svgContent += "</svg>";

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
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

    for (const layer of layers) {
      if (!layer.visible) continue;

      if (layer.type === "draw" && layer.elements) {
        for (const el of layer.elements) {
          if ((el as any).shapeType) {
            const s = el as IExportShapeLayer;
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x + s.width);
            maxY = Math.max(maxY, s.y + s.height);
            hasContent = true;
          } else {
            const stroke = el as IStroke;
            for (const point of stroke.points) {
              minX = Math.min(minX, point.x);
              minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x);
              maxY = Math.max(maxY, point.y);
              hasContent = true;
            }
          }
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

    for (const layer of layers) {
      if (!layer.visible) continue;

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity * prevAlpha;

      if (layer.type === "draw" && layer.elements) {
        // Strokes bake into an offscreen so eraser destination-out works as a layer-local op.
        const strokeOnly = layer.elements.filter(
          (e) => !(e as any).shapeType,
        ) as IStroke[];

        if (strokeOnly.length > 0) {
          const strokeCanvas = document.createElement("canvas");
          const canvasSize =
            Math.max(
              bounds?.maxX || width,
              bounds?.maxY || height,
              width,
              height,
            ) + 100;
          strokeCanvas.width = canvasSize;
          strokeCanvas.height = canvasSize;
          const strokeCtx = strokeCanvas.getContext("2d");

          if (strokeCtx) {
            this.renderStrokesToCanvas(strokeCtx, strokeOnly);
            ctx.drawImage(strokeCanvas, 0, 0);
          }
        }

        // Shapes render as vectors on top, in element order.
        for (const el of layer.elements) {
          if ((el as any).shapeType) {
            renderShape(ctx, el as any);
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

  private static generateSVGPath(
    stroke: IStroke,
    canvasWidth: number,
    canvasHeight: number,
    scale: number,
  ): string {
    const screenPoints = stroke.points.map((p) => [
      p.x * scale,
      p.y * scale,
      p.pressure || 0.5,
    ]);

    const strokePath = getStroke(screenPoints, {
      size: stroke.size * scale,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      easing: easingFn(stroke.easing ?? "linear"),
      start: {
        taper: 0,
        easing: (t) => t,
      },
      end: {
        taper: 0,
        easing: (t) => t,
      },
    });

    if (!strokePath.length) return "";

    const d = strokePath.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ["M", ...strokePath[0], "Q"],
    );

    d.push("Z");
    return d.join(" ");
  }

  private static drawGrid(
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

  private static generateGridSVG(width: number, height: number): string {
    const gridSize = 20;
    let gridSVG = '<g stroke="#f0f0f0" stroke-width="1" fill="none">';

    for (let x = 0; x < width; x += gridSize) {
      gridSVG += `<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`;
    }

    for (let y = 0; y < height; y += gridSize) {
      gridSVG += `<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`;
    }

    gridSVG += "</g>";
    return gridSVG;
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
