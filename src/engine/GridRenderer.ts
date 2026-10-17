import type { PanZoom } from "./types";

export class GridRenderer {
  constructor(private gridSize = 20) {}

  draw(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    pz: PanZoom,
    origin?: { x: number; y: number },
  ) {
    if (!origin) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.save();
    if (!origin) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;

    // Match stroke transform: translate then scale (screen = zoom*world + pan)
    ctx.translate(pz.panX, pz.panY);
    ctx.scale(pz.zoom, pz.zoom);
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1 / pz.zoom;

    // Since screen = zoom*world + pan, solving for world from screen bounds:
    const worldLeft = (0 - pz.panX) / pz.zoom;
    const worldRight = (canvas.width - pz.panX) / pz.zoom;
    const worldTop = (0 - pz.panY) / pz.zoom;
    const worldBottom = (canvas.height - pz.panY) / pz.zoom;

    const startX = ox + Math.floor((worldLeft - ox) / this.gridSize) * this.gridSize;
    const endX = ox + Math.ceil((worldRight - ox) / this.gridSize) * this.gridSize;
    const startY = oy + Math.floor((worldTop - oy) / this.gridSize) * this.gridSize;
    const endY = oy + Math.ceil((worldBottom - oy) / this.gridSize) * this.gridSize;

    for (let x = startX; x <= endX; x += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, worldTop - this.gridSize);
      ctx.lineTo(x, worldBottom + this.gridSize);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(worldLeft - this.gridSize, y);
      ctx.lineTo(worldRight + this.gridSize, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
