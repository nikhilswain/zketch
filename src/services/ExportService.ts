import { getStroke } from "perfect-freehand";
import type { IStroke, BackgroundType } from "../models/CanvasModel";
import type { IExportSettings } from "../models/SettingsModel";

export class ExportService {
  static async exportToPNG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = width * settings.scale;
    canvas.height = height * settings.scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    // Scale context for high-resolution export
    ctx.scale(settings.scale, settings.scale);

    // Set background
    if (!settings.transparentBackground) {
      if (background === "white") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      } else if (background === "grid") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        this.drawGrid(ctx, width, height);
      } else {
        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Calculate stroke bounds and scale factor
    const bounds = this.calculateStrokeBounds(strokes);
    if (bounds) {
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // Leave some padding

      const offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
      const offsetY =
        (height - bounds.height * scale) / 2 - bounds.minY * scale;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
    }

    // Render strokes
    this.renderStrokesToCanvas(ctx, strokes, width, height);

    if (bounds) {
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  }

  static async exportToJPG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings
  ): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = width * settings.scale;
    canvas.height = height * settings.scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    // Scale context for high-resolution export
    ctx.scale(settings.scale, settings.scale);

    // JPG doesn't support transparency, always use background
    if (background === "white" || settings.transparentBackground) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    } else if (background === "grid") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      this.drawGrid(ctx, width, height);
    } else {
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(0, 0, width, height);
    }

    // Calculate stroke bounds and scale factor
    const bounds = this.calculateStrokeBounds(strokes);
    if (bounds) {
      const scaleX = width / bounds.width;
      const scaleY = height / bounds.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // Leave some padding

      const offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
      const offsetY =
        (height - bounds.height * scale) / 2 - bounds.minY * scale;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
    }

    // Render strokes
    this.renderStrokesToCanvas(ctx, strokes, width, height);

    if (bounds) {
      ctx.restore();
    }

    return canvas.toDataURL("image/jpeg", settings.quality);
  }

  static async exportToSVG(
    strokes: IStroke[],
    background: BackgroundType,
    width: number,
    height: number,
    settings: IExportSettings
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

  private static renderStrokesToCanvas(
    ctx: CanvasRenderingContext2D,
    strokes: IStroke[],
    width: number,
    height: number
  ) {
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      const prevComposite = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = (
        stroke.brushStyle === "eraser" ? "destination-out" : "source-over"
      ) as GlobalCompositeOperation;

      switch (stroke.brushStyle) {
        case "spray":
          this.renderSpray(ctx, stroke);
          break;
        case "texture":
          this.renderTexture(ctx, stroke);
          break;
        default: {
          const path = this.getStrokePath(stroke, width, height);
          if (!path) break;
          const prevAlpha = ctx.globalAlpha;
          ctx.fillStyle = stroke.color;
          ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
          const path2D = new Path2D(path);
          ctx.fill(path2D);
          ctx.globalAlpha = prevAlpha;
          break;
        }
      }

      ctx.globalCompositeOperation = prevComposite;
    });
  }

  private static getStrokePath(
    stroke: IStroke,
    canvasWidth: number,
    canvasHeight: number
  ): string {
    const screenPoints = stroke.points.map((p) => [
      p.x,
      p.y,
      p.pressure || 0.5,
    ]);

    const strokePath = getStroke(screenPoints, {
      size: stroke.size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      easing: (t) => t,
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
      ["M", ...strokePath[0], "Q"]
    );

    d.push("Z");
    return d.join(" ");
  }

  private static generateSVGPath(
    stroke: IStroke,
    canvasWidth: number,
    canvasHeight: number,
    scale: number
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
      easing: (t) => t,
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
      ["M", ...strokePath[0], "Q"]
    );

    d.push("Z");
    return d.join(" ");
  }

  // --- Brush renderers for export parity ---
  private static seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  private static renderSpray(ctx: CanvasRenderingContext2D, stroke: IStroke) {
    const size = stroke.size;
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = (stroke.opacity ?? 1) * prevAlpha;
    for (let i = 0; i < stroke.points.length; i++) {
      const { x, y, pressure = 0.5 } = stroke.points[i];
      const currentSize = size * pressure;
      const density = Math.max(3, currentSize * 0.3);
      for (let j = 0; j < density; j++) {
        const s1 = x * 1000 + y * 100 + j * 10 + i;
        const s2 = x * 100 + y * 1000 + j * 5 + i * 2;
        const s3 = x * 10 + y * 10 + j + i * 3;
        const angle = this.seededRandom(s1) * Math.PI * 2;
        const distance = this.seededRandom(s2) * currentSize * 0.8;
        const sx = x + Math.cos(angle) * distance;
        const sy = y + Math.sin(angle) * distance;
        const dot = this.seededRandom(s3) * 2 + 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  private static renderTexture(ctx: CanvasRenderingContext2D, stroke: IStroke) {
    const baseAlpha = ctx.globalAlpha;
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
    for (let layer = 0; layer < 3; layer++) {
      const layerOpacity = 0.3 - layer * 0.1;
      const offset = layer * 2;
      const offsetPts = pts.map(([x, y, pr], idx) => {
        const s1 = x * 1000 + y * 100 + layer * 50 + idx;
        const s2 = x * 100 + y * 1000 + layer * 25 + idx * 2;
        return [
          x + (this.seededRandom(s1) - 0.5) * offset,
          y + (this.seededRandom(s2) - 0.5) * offset,
          pr,
        ];
      });
      const outline = getStroke(
        offsetPts as any,
        {
          size: stroke.size * (0.8 + layer * 0.1),
          thinning: 0.7,
          smoothing: 0.5,
          streamline: 0.5,
          start: { cap: false, taper: 10 },
          end: { cap: false, taper: 10 },
          last: true,
        } as any
      );
      if (outline.length < 3) continue;
      ctx.globalAlpha = (stroke.opacity ?? 1) * layerOpacity * baseAlpha;
      const path2 = new Path2D(
        outline
          .reduce(
            (acc: any[], [x0, y0]: number[], i: number, arr: number[][]) => {
              const [x1, y1] = arr[(i + 1) % arr.length];
              acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
              return acc;
            },
            ["M", ...outline[0], "Q"] as any
          )
          .join(" ") + " Z"
      );
      ctx.fillStyle = stroke.color;
      ctx.fill(path2);
    }
    ctx.globalAlpha = baseAlpha;
  }

  private static drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
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
