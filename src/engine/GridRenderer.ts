import type { PanZoom } from "./types";

export class GridRenderer {
  constructor(private gridSize = 20) {}

  draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pz: PanZoom) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

    const startX = Math.floor(worldLeft / this.gridSize) * this.gridSize;
    const endX = Math.ceil(worldRight / this.gridSize) * this.gridSize;
    const startY = Math.floor(worldTop / this.gridSize) * this.gridSize;
    const endY = Math.ceil(worldBottom / this.gridSize) * this.gridSize;

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
