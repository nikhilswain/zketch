import type { IStroke } from "../models/CanvasModel";
import { getStroke } from "perfect-freehand";

export class ThumbnailService {
  static generateThumbnail(
    strokes: IStroke[],
    background: string,
    width = 200,
    height = 150,
  ): string {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    // Set background
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

    // Render strokes with compositing parity
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

    return canvas.toDataURL();
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
