import { FreehandBrush } from "./brushes/FreehandBrush";
import { SprayBrush } from "./brushes/SprayBrush";
import { TextureBrush } from "./brushes/TextureBrush";
import { GridRenderer } from "./GridRenderer";
import type {
  Brush,
  BrushStyle,
  EngineConfig,
  PanZoom,
  StrokeLike,
} from "./types";

class BrushRegistry {
  private brushes = new Map<BrushStyle, Brush>();
  register(b: Brush) {
    this.brushes.set(b.key, b);
  }
  get(k: BrushStyle) {
    return this.brushes.get(k);
  }
}

export class CanvasEngine {
  private bg: HTMLCanvasElement;
  private fg: HTMLCanvasElement;
  private ui: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private fgCtx: CanvasRenderingContext2D;
  private uiCtx: CanvasRenderingContext2D;
  private pz: PanZoom = { panX: 0, panY: 0, zoom: 1 };
  private registry = new BrushRegistry();
  private grid = new GridRenderer();
  private rafId: number | null = null;
  private invalid = true;
  private background: EngineConfig["background"];
  private preview: StrokeLike | null = null;
  private cursor: { visible: boolean; x?: number; y?: number; r?: number } = {
    visible: false,
  };

  constructor(private root: HTMLElement, private config: EngineConfig) {
    this.bg = document.createElement("canvas");
    this.fg = document.createElement("canvas");
    this.ui = document.createElement("canvas");
    Object.assign(this.bg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    Object.assign(this.fg.style, {
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
    this.root.appendChild(this.fg);
    this.root.appendChild(this.ui);
    const bg = this.bg.getContext("2d");
    const fg = this.fg.getContext("2d");
    const ui = this.ui.getContext("2d");
    if (!bg || !fg || !ui) throw new Error("Failed to get 2d context");
    this.bgCtx = bg;
    this.fgCtx = fg;
    this.uiCtx = ui;
    this.background = config.background;
    this.registry.register(new FreehandBrush());
    this.registry.register(new SprayBrush());
    this.registry.register(new TextureBrush());
    this.resize();
    window.addEventListener("resize", this.resize);
    this.loop();
  }

  destroy = () => {
    window.removeEventListener("resize", this.resize);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.root.removeChild(this.bg);
    this.root.removeChild(this.fg);
    this.root.removeChild(this.ui);
  };

  setPanZoom(p: Partial<PanZoom>) {
    this.pz = { ...this.pz, ...p };
    this.invalidate();
  }
  setBackground(bg: EngineConfig["background"]) {
    this.background = bg;
    this.invalidate();
  }
  setPreviewStroke(s: StrokeLike | null) {
    this.preview = s;
    this.invalidate();
  }
  setCursor(c: { visible: boolean; x?: number; y?: number; r?: number }) {
    this.cursor = c;
    this.invalidate();
  }
  invalidate = () => {
    this.invalid = true;
    this.config.onInvalidate?.();
  };

  private resize = () => {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    for (const c of [this.bg, this.fg, this.ui]) {
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.invalidate();
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
    }
  }

  private renderStrokes() {
    const ctx = this.fgCtx;
    const c = this.fg;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    // Translate then scale -> effective order on points: scale then translate
    // This matches screen = zoom * world + pan
    ctx.translate(this.pz.panX, this.pz.panY);
    ctx.scale(this.pz.zoom, this.pz.zoom);
    const strokes = this.config.getStrokes();
    for (const s of strokes) this.renderStroke(ctx, s);
    if (this.preview) this.renderStroke(ctx, this.preview);
    ctx.restore();
  }

  private renderStroke(ctx: CanvasRenderingContext2D, s: StrokeLike) {
    const composite =
      s.brushStyle === "eraser" ? "destination-out" : "source-over";
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = composite as GlobalCompositeOperation;
    const key: BrushStyle = s.brushStyle === "eraser" ? "ink" : s.brushStyle;
    const brush = this.registry.get(key);
    if (!brush) return;
    const opts = this.config.getBrushOptions?.(key, s.size);
    brush.render(ctx, s, opts);
    ctx.globalCompositeOperation = prev;
  }

  private renderOverlay() {
    const ctx = this.uiCtx;
    const c = this.ui;
    ctx.clearRect(0, 0, c.width, c.height);
    if (
      !this.cursor.visible ||
      this.cursor.x == null ||
      this.cursor.y == null ||
      this.cursor.r == null
    )
      return;
    ctx.save();
    ctx.strokeStyle = "#666666";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(this.cursor.x, this.cursor.y, this.cursor.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
