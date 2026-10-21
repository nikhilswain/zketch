import type { IImageLayerData, ILayerData, ISavedDrawingData } from "@/models/VaultModel";
import { ExportService, type IExportLayer } from "@/services/ExportService";
import { elementKind } from "@/engine/types";
import {
  brushRegistry,
  buildElementLookup,
  drawImageLayer,
  elementBounds,
  renderDrawLayer,
  renderStroke,
  type Bounds,
  type ElementLookup,
} from "@/engine/render";
import { createCanvas } from "@/engine/render/canvasFactory";
import { labelsByContainer } from "@/engine/geometry/labels";
import {
  brushAssetsPending,
  installBrushAssetLoader,
  onBrushAssetsChanged,
} from "@/engine/stamp/assets";
import type { Page } from "@/utils/page";
import { buildReplay, partialStroke, progressAt, type Replay } from "./replay";

export type Frame = { x: number; y: number; width: number; height: number };

type Point = { x: number; y: number };

type Source =
  | { type: "draw"; index: number; opacity: number; elements: any[] }
  | { type: "image"; index: number; opacity: number; image: IImageLayerData };

type DrawState = {
  type: "draw";
  index: number;
  opacity: number;
  elements: any[];
  labels: Map<string, any>;
  settled: HTMLCanvasElement;
  settledCtx: CanvasRenderingContext2D;
  count: number;
  kept: HTMLCanvasElement | null;
  keptCount: number;
};

type ImageState = {
  type: "image";
  index: number;
  opacity: number;
  image: IImageLayerData;
  img: HTMLImageElement | null;
};

const FRAME_PAD = 40;
const REVEAL_PAD = 8;
const ASSET_WAIT_MS = 1500;

function sourcesOf(layers: ILayerData[]): Source[] {
  const out: Source[] = [];
  layers.forEach((layer, index) => {
    if (!layer.visible) return;
    if (layer.type === "draw") {
      out.push({ type: "draw", index, opacity: layer.opacity, elements: layer.elements as any[] });
    } else if (layer.type === "stroke") {
      out.push({ type: "draw", index, opacity: layer.opacity, elements: (layer.strokes ?? []) as any[] });
    } else if (layer.type === "image") {
      out.push({ type: "image", index, opacity: layer.opacity, image: layer });
    }
  });
  return out;
}

function lookupOf(sources: Source[]): ElementLookup {
  return buildElementLookup(sources.flatMap((s) => (s.type === "draw" ? [s] : [])));
}

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function shareFrame(drawing: ISavedDrawingData): Frame {
  const page: Page | undefined = drawing.page;
  if (page) return { x: page.x, y: page.y, width: page.width, height: page.height };
  const sources = sourcesOf(drawing.layers);
  const lookup = lookupOf(sources);
  let b: Bounds | null = null;
  for (const s of sources) {
    if (s.type === "draw") {
      for (const el of s.elements) b = unionBounds(b, elementBounds(el, lookup));
    } else {
      const { x, y, width, height } = s.image;
      b = unionBounds(b, { minX: x, minY: y, maxX: x + width, maxY: y + height });
    }
  }
  if (!b) return { x: 0, y: 0, width: 800, height: 600 };
  return {
    x: b.minX - FRAME_PAD,
    y: b.minY - FRAME_PAD,
    width: b.maxX - b.minX + FRAME_PAD * 2,
    height: b.maxY - b.minY + FRAME_PAD * 2,
  };
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  return ctx;
}

export class ReplayRenderer {
  readonly replay: Replay;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly frame: Frame;
  private readonly width: number;
  private readonly height: number;
  private readonly kx: number;
  private readonly ky: number;
  private readonly lookup: ElementLookup;
  private readonly starts = new Map<string, number>();
  private layers: (DrawState | ImageState)[];
  private scratch: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D;
  private lastT = -Infinity;
  private stale = false;
  private keepT: number | null = null;
  private kept = false;
  private preparing: Promise<void> | null = null;
  private stopAssets: () => void;
  private urls: string[] = [];
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly drawing: ISavedDrawingData,
    scale: number,
    private readonly blobs?: Map<string, Blob>,
  ) {
    this.frame = shareFrame(drawing);
    this.width = Math.max(1, Math.round(this.frame.width * scale));
    this.height = Math.max(1, Math.round(this.frame.height * scale));
    this.kx = this.width / this.frame.width;
    this.ky = this.height / this.frame.height;
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = context(canvas);
    this.replay = buildReplay(drawing.layers);
    for (const item of this.replay.items) {
      this.starts.set(`${item.layer}:${item.element}`, item.start);
    }
    const sources = sourcesOf(drawing.layers);
    this.lookup = lookupOf(sources);
    this.layers = sources.map((s) => {
      if (s.type === "image") return { ...s, img: null };
      const settled = createCanvas(this.width, this.height);
      const settledCtx = context(settled);
      this.toWorld(settledCtx);
      return {
        ...s,
        labels: labelsByContainer(s.elements),
        settled,
        settledCtx,
        count: 0,
        kept: null,
        keptCount: 0,
      };
    });
    this.scratch = createCanvas(this.width, this.height);
    this.scratchCtx = context(this.scratch);
    this.stopAssets = onBrushAssetsChanged(() => {
      this.stale = true;
    });
  }

  ready(): Promise<void> {
    this.preparing ??= this.prepare();
    return this.preparing;
  }

  keep(t: number): void {
    if (this.keepT === t) return;
    this.keepT = t;
    this.kept = false;
  }

  draw(t: number): { tip: Point | null } {
    if (this.stale) {
      this.kept = false;
      this.reset();
    } else if (t < this.lastT) {
      if (this.kept && this.keepT !== null && this.keepT <= t) this.restore();
      else this.reset();
    }
    this.lastT = t;
    const progress = progressAt(this.replay, t);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.drawing.background === "grid") {
      ctx.setTransform(this.kx, 0, 0, this.ky, 0, 0);
      ExportService.drawGrid(ctx, this.frame.width, this.frame.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    let tip: Point | null = null;
    let tipStart = -Infinity;
    for (const layer of this.layers) {
      ctx.globalAlpha = layer.opacity;
      if (layer.type === "image") {
        if (layer.img) {
          this.toWorld(ctx);
          drawImageLayer(ctx, layer.img, layer.image);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        continue;
      }
      this.settle(layer, progress);
      const active: number[] = [];
      for (let i = layer.count; i < layer.elements.length; i++) {
        if (progress.has(`${layer.index}:${i}`)) active.push(i);
      }
      if (active.length === 0) {
        ctx.drawImage(layer.settled, 0, 0);
        continue;
      }
      const sctx = this.scratchCtx;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, this.width, this.height);
      sctx.drawImage(layer.settled, 0, 0);
      this.toWorld(sctx);
      for (const i of active) {
        const key = `${layer.index}:${i}`;
        const p = progress.get(key)!;
        const at = this.renderElement(sctx, layer, i, p);
        const start = this.starts.get(key) ?? 0;
        if (p < 1 && at && start >= tipStart) {
          tipStart = start;
          tip = {
            x: (at.x - this.frame.x) * this.kx,
            y: (at.y - this.frame.y) * this.ky,
          };
        }
      }
      ctx.drawImage(this.scratch, 0, 0);
    }
    ctx.globalAlpha = 1;
    if (!this.kept && this.keepT === t) this.save();
    return { tip };
  }

  dispose(): void {
    this.disposed = true;
    this.stopAssets();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    for (const layer of this.layers) {
      if (layer.type === "draw") {
        layer.settled.width = 0;
        layer.settled.height = 0;
        if (layer.kept) {
          layer.kept.width = 0;
          layer.kept.height = 0;
        }
      }
    }
    this.layers = [];
    this.scratch.width = 0;
    this.scratch.height = 0;
  }

  private async prepare(): Promise<void> {
    installBrushAssetLoader();
    await ExportService.preloadImages(
      this.exportLayers().filter((l) => !(l.imageData && this.blobs?.has(l.imageData.blobId))),
    );
    await Promise.all(
      this.layers.map(async (layer) => {
        if (layer.type === "image") layer.img = await this.loadImage(layer.image.blobId);
      }),
    );
    this.probeBrushes();
    if (brushAssetsPending() > 0) await this.assetsSettled();
    this.stale = true;
  }

  private loadImage(blobId: string): Promise<HTMLImageElement | null> {
    const blob = this.blobs?.get(blobId);
    if (!blob) return ExportService.loadImage(blobId);
    const url = URL.createObjectURL(blob);
    if (this.disposed) {
      URL.revokeObjectURL(url);
      return Promise.resolve(null);
    }
    this.urls.push(url);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  private exportLayers(): IExportLayer[] {
    return this.layers.map((layer) =>
      layer.type === "draw"
        ? { type: "draw", visible: true, opacity: layer.opacity, elements: layer.elements }
        : {
            type: "image",
            visible: true,
            opacity: layer.opacity,
            imageData: {
              blobId: layer.image.blobId,
              x: layer.image.x,
              y: layer.image.y,
              width: layer.image.width,
              height: layer.image.height,
              rotation: layer.image.rotation,
              opacity: layer.opacity,
              visible: true,
            },
          },
    );
  }

  private probeBrushes(): void {
    const probe = createCanvas(2, 2);
    const ctx = context(probe);
    ctx.setTransform(0.01, 0, 0, 0.01, 0, 0);
    for (const layer of this.layers) {
      if (layer.type !== "draw") continue;
      for (const el of layer.elements) {
        if (elementKind(el) !== "stroke" || !el.points?.length) continue;
        renderStroke(ctx, { ...el, points: el.points.slice(0, 3) }, brushRegistry);
      }
    }
    probe.width = 0;
    probe.height = 0;
  }

  private assetsSettled(): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        off();
        clearTimeout(timer);
        resolve();
      };
      const off = onBrushAssetsChanged(() => {
        if (brushAssetsPending() === 0) finish();
      });
      const timer = setTimeout(finish, ASSET_WAIT_MS);
    });
  }

  private toWorld(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.kx, 0, 0, this.ky, -this.frame.x * this.kx, -this.frame.y * this.ky);
  }

  private reset(): void {
    this.stale = false;
    for (const layer of this.layers) {
      if (layer.type !== "draw") continue;
      layer.settledCtx.setTransform(1, 0, 0, 1, 0, 0);
      layer.settledCtx.clearRect(0, 0, this.width, this.height);
      this.toWorld(layer.settledCtx);
      layer.count = 0;
    }
  }

  private save(): void {
    for (const layer of this.layers) {
      if (layer.type !== "draw") continue;
      layer.kept ??= createCanvas(this.width, this.height);
      const kctx = context(layer.kept);
      kctx.clearRect(0, 0, this.width, this.height);
      kctx.drawImage(layer.settled, 0, 0);
      layer.keptCount = layer.count;
    }
    this.kept = true;
  }

  private restore(): void {
    for (const layer of this.layers) {
      if (layer.type !== "draw" || !layer.kept) continue;
      layer.settledCtx.setTransform(1, 0, 0, 1, 0, 0);
      layer.settledCtx.clearRect(0, 0, this.width, this.height);
      layer.settledCtx.drawImage(layer.kept, 0, 0);
      this.toWorld(layer.settledCtx);
      layer.count = layer.keptCount;
    }
  }

  private settle(layer: DrawState, progress: Map<string, number>): void {
    while (
      layer.count < layer.elements.length &&
      progress.get(`${layer.index}:${layer.count}`) === 1
    ) {
      this.renderElement(layer.settledCtx, layer, layer.count, 1);
      layer.count++;
    }
  }

  private renderElement(
    ctx: CanvasRenderingContext2D,
    layer: DrawState,
    i: number,
    p: number,
  ): Point | null {
    const el = layer.elements[i];
    const kind = elementKind(el);
    if (kind === "text" && el.containerId) return null;
    if (kind === "stroke") {
      const stroke = p < 1 ? partialStroke(el, p) : el;
      renderDrawLayer(ctx, [stroke], { lookup: this.lookup });
      const last = stroke.points[stroke.points.length - 1];
      return last ? { x: last.x, y: last.y } : null;
    }
    const label = kind === "text" ? undefined : layer.labels.get(el.id);
    const els = label ? [el, label] : [el];
    if (p >= 1) {
      renderDrawLayer(ctx, els, { lookup: this.lookup });
      return null;
    }
    const b = els.reduce<Bounds | null>(
      (acc, e) => unionBounds(acc, elementBounds(e, this.lookup)),
      null,
    );
    if (!b) return null;
    const x = b.minX - REVEAL_PAD;
    const w = (b.maxX - b.minX + REVEAL_PAD * 2) * p;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, b.minY - REVEAL_PAD, w, b.maxY - b.minY + REVEAL_PAD * 2);
    ctx.clip();
    renderDrawLayer(ctx, els, { lookup: this.lookup });
    ctx.restore();
    return { x: x + w, y: (b.minY + b.maxY) / 2 };
  }
}
