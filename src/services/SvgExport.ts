import { elementKind, type ElementLike, type StrokeLike } from "@/engine/types";
import { buildElementLookup, elementBounds, renderDrawLayer, unionBounds, type Bounds, type ElementLookup } from "@/engine/render";
import { ensureFonts, fontFamiliesIn } from "@/engine/render/fonts";
import { labelsByContainer } from "@/engine/geometry/labels";
import { outlineData } from "@/engine/brushes/FreehandBrush";
import { brushAssetsPending, whenBrushAssetsReady } from "@/engine/stamp/assets";
import { LOOK_BRUSHES } from "@/engine/render/sketchy";
import { BlobStorageService } from "./BlobStorageService";
import { SvgContext, escapeXml } from "@/engine/svg/SvgContext";
import type { BackgroundType } from "@/models/CanvasModel";
import type { IExportLayer } from "./ExportService";

export type SvgFrame = { x: number; y: number; width: number; height: number };

const RASTER_PAD = 8;
const MAX_RASTER = 4096;
const GRID = 20;

const num = (v: number) => String(Math.round(v * 100) / 100);

const GOOGLE_FAMILIES: Record<string, { name: string; query: string }> = {
  hand: { name: "Kalam", query: "Kalam" },
  sans: { name: "Instrument Sans", query: "Instrument+Sans" },
  mono: { name: "JetBrains Mono", query: "JetBrains+Mono" },
};

function textByFamily(layers: IExportLayer[]): Map<string, string> {
  const chars = new Map<string, Set<string>>();
  for (const layer of layers) {
    if (!layer.visible || layer.type !== "draw" || !layer.elements) continue;
    for (const el of layer.elements as any[]) {
      if (el?.kind !== "text" || !el.text) continue;
      const set = chars.get(el.fontFamily) ?? new Set<string>();
      for (const ch of el.text as string) if (ch.trim()) set.add(ch);
      chars.set(el.fontFamily, set);
    }
  }
  return new Map([...chars].map(([family, set]) => [family, [...set].join("")]));
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function embeddedFonts(layers: IExportLayer[]): Promise<string> {
  const rules: string[] = [];
  for (const [family, text] of textByFamily(layers)) {
    const font = GOOGLE_FAMILIES[family];
    if (!font || !text) continue;
    try {
      const css = await (
        await fetch(`https://fonts.googleapis.com/css2?family=${font.query}&text=${encodeURIComponent(text)}`, {
          signal: AbortSignal.timeout(4000),
        })
      ).text();
      const src = css.match(/url\((https:[^)]+)\)\s*format\(['"]?([\w-]+)['"]?\)/);
      if (!src) continue;
      const data = toBase64(await (await fetch(src[1], { signal: AbortSignal.timeout(4000) })).arrayBuffer());
      const mime = src[2] === "woff2" ? "font/woff2" : src[2] === "woff" ? "font/woff" : "font/ttf";
      rules.push(`@font-face{font-family:"${font.name}";src:url(data:${mime};base64,${data}) format("${src[2]}");}`);
    } catch (error) {
      console.warn(`Couldn't embed the ${font.name} font in the SVG:`, error);
    }
  }
  return rules.length ? `<style>${rules.join("")}</style>` : "";
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function reach(el: ElementLike): number {
  if (elementKind(el) === "stroke") return Math.max(RASTER_PAD, (el as StrokeLike).size * 2.2 + 2);
  const { look, strokeWidth } = el as { look?: string; strokeWidth?: number };
  const spec = look && look !== "clean" ? LOOK_BRUSHES[look as keyof typeof LOOK_BRUSHES] : undefined;
  const w = strokeWidth ?? 0;
  return spec ? Math.max(RASTER_PAD, w * spec.scale + 3 + 0.8 * w) : RASTER_PAD;
}

const href = (url: string) => ` href="${url}" xlink:href="${url}"`;

export function fitFrame(layers: IExportLayer[], width: number, height: number): SvgFrame {
  const lookup = buildElementLookup(layers as any);
  let b: Bounds | null = null;
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.type === "draw" && layer.elements) {
      for (const el of layer.elements) b = unionBounds(b, elementBounds(el as any, lookup));
    } else if (layer.type === "image" && layer.imageData) {
      const i = layer.imageData;
      b = unionBounds(b, { minX: i.x, minY: i.y, maxX: i.x + i.width, maxY: i.y + i.height });
    }
  }
  if (!b || b.maxX <= b.minX || b.maxY <= b.minY) return { x: 0, y: 0, width, height };
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const scale = Math.min(width / bw, height / bh) * 0.9;
  const fw = width / scale;
  const fh = height / scale;
  return { x: b.minX - (fw - bw) / 2, y: b.minY - (fh - bh) / 2, width: fw, height: fh };
}

class Builder {
  private id = 0;
  readonly defs: string[] = [];
  private masks = new Map<string, { area: string; paths: string[] }>();
  private assetDeadline = 0;

  constructor(
    private frame: SvgFrame,
    private pxPerUnit: number,
    private lookup: ElementLookup,
  ) {}

  nextId = () => `z${++this.id}`;

  async drawLayer(elements: ElementLike[]): Promise<string> {
    const labels = labelsByContainer(elements);
    let out = "";
    let lastMask: { id: string; length: number } | null = null;
    let run: ElementLike[] = [];
    const flush = async () => {
      if (run.length) out += await this.raster(run);
      run = [];
    };
    for (const el of elements) {
      const kind = elementKind(el);
      if (kind === "text" && (el as { containerId?: string }).containerId) continue;
      if (kind === "stroke" && (el as StrokeLike).brushStyle === "eraser") {
        await flush();
        const d = outlineData({ ...(el as StrokeLike), taperStart: 0, taperEnd: 0, opacity: 1, input: null });
        if (!d || !out) continue;
        const path = `<path d="${escapeXml(d)}" fill="#000"/>`;
        if (lastMask && lastMask.length === out.length) {
          this.masks.get(lastMask.id)!.paths.push(path);
        } else {
          const id = this.mask(path);
          out = `<g mask="url(#${id})">${out}</g>`;
          lastMask = { id, length: out.length };
        }
        continue;
      }
      const label = kind === "stroke" || kind === "text" ? undefined : labels.get(el.id);
      const group = label ? [el, label] : [el];
      const rec = new SvgContext(this.nextId);
      try {
        renderDrawLayer(rec as unknown as CanvasRenderingContext2D, group, { lookup: this.lookup });
      } catch {
        run.push(...group);
        continue;
      }
      await flush();
      this.defs.push(...rec.defs);
      out += rec.body();
    }
    await flush();
    return out;
  }

  private mask(path: string): string {
    const id = this.nextId();
    const f = this.frame;
    const big = Math.max(f.width, f.height);
    const area = `x="${num(f.x - big)}" y="${num(f.y - big)}" width="${num(f.width + big * 2)}" height="${num(f.height + big * 2)}"`;
    this.masks.set(id, { area, paths: [path] });
    return id;
  }

  maskDefs(): string {
    return [...this.masks]
      .map(([id, m]) => `<mask id="${id}" maskUnits="userSpaceOnUse" ${m.area}><rect ${m.area} fill="#fff"/>${m.paths.join("")}</mask>`)
      .join("");
  }

  private async raster(els: ElementLike[]): Promise<string> {
    let b: Bounds | null = null;
    for (const el of els) {
      const e = elementBounds(el, this.lookup);
      if (!e) continue;
      const r = reach(el);
      b = unionBounds(b, { minX: e.minX - r, minY: e.minY - r, maxX: e.maxX + r, maxY: e.maxY + r });
    }
    if (!b) return "";
    const f = this.frame;
    const minX = Math.max(b.minX, f.x);
    const minY = Math.max(b.minY, f.y);
    const maxX = Math.min(b.maxX, f.x + f.width);
    const maxY = Math.min(b.maxY, f.y + f.height);
    if (maxX <= minX || maxY <= minY) return "";
    const w = maxX - minX;
    const h = maxY - minY;
    const k = Math.min(this.pxPerUnit, MAX_RASTER / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w * k));
    canvas.height = Math.max(1, Math.ceil(h * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, -minX * k, -minY * k);
      renderDrawLayer(ctx, els, { lookup: this.lookup });
    };
    draw();
    if (brushAssetsPending()) {
      this.assetDeadline ||= Date.now() + 5000;
      const left = this.assetDeadline - Date.now();
      if (left > 0 && (await whenBrushAssetsReady(left))) draw();
    }
    return `<image x="${num(minX)}" y="${num(minY)}" width="${num(canvas.width / k)}" height="${num(canvas.height / k)}" preserveAspectRatio="none"${href(canvas.toDataURL("image/png"))}/>`;
  }
}

function background(kind: BackgroundType, transparent: boolean, frame: SvgFrame, unit: number, defs: string[]): string {
  if (transparent || kind === "transparent") return "";
  const rect = `<rect x="${num(frame.x)}" y="${num(frame.y)}" width="${num(frame.width)}" height="${num(frame.height)}"`;
  if (kind !== "grid") return `${rect} fill="#ffffff"/>`;
  const g = GRID * unit;
  const half = unit / 2;
  defs.push(
    `<pattern id="zgrid" patternUnits="userSpaceOnUse" x="${num(frame.x - half)}" y="${num(frame.y - half)}" width="${num(g)}" height="${num(g)}">` +
      `<path d="M0 ${num(half)}H${num(g)}M${num(half)} 0V${num(g)}" fill="none" stroke="#f0f0f0" stroke-width="${num(unit)}"/></pattern>`,
  );
  return `${rect} fill="#ffffff"/>${rect} fill="url(#zgrid)"/>`;
}

export async function exportSvg(
  layers: IExportLayer[],
  options: {
    frame: SvgFrame;
    outWidth: number;
    outHeight: number;
    background: BackgroundType;
    transparent: boolean;
    gridUnit: number;
  },
): Promise<string> {
  const { frame, outWidth, outHeight } = options;
  await ensureFonts(fontFamiliesIn(layers as any));
  const lookup = buildElementLookup(layers as any);
  const builder = new Builder(frame, (outWidth / frame.width) * 2, lookup);
  const clipId = builder.nextId();
  let body = "";
  for (const layer of layers) {
    if (!layer.visible) continue;
    const opacity = layer.opacity < 1 ? ` opacity="${Math.round(layer.opacity * 1000) / 1000}"` : "";
    if (layer.type === "draw" && layer.elements?.length) {
      const content = await builder.drawLayer(layer.elements as unknown as ElementLike[]);
      if (content) body += `<g${opacity} style="isolation:isolate">${content}</g>`;
    } else if (layer.type === "image" && layer.imageData) {
      const i = layer.imageData;
      const stored = await BlobStorageService.getBlob(i.blobId);
      if (!stored) continue;
      const url = await blobDataUrl(stored.blob);
      const rot = i.rotation ? ` transform="rotate(${num(i.rotation)} ${num(i.x + i.width / 2)} ${num(i.y + i.height / 2)})"` : "";
      const imgOpacity = i.opacity < 1 ? ` opacity="${Math.round(i.opacity * 1000) / 1000}"` : "";
      body +=
        `<g${opacity}><image x="${num(i.x)}" y="${num(i.y)}" width="${num(i.width)}" height="${num(i.height)}"` +
        ` preserveAspectRatio="none"${rot}${imgOpacity}${href(url)}/></g>`;
    }
  }
  const fonts = await embeddedFonts(layers);
  const bg = background(options.background, options.transparent, frame, options.gridUnit, builder.defs);
  builder.defs.push(
    `<clipPath id="${clipId}"><rect x="${num(frame.x)}" y="${num(frame.y)}" width="${num(frame.width)}" height="${num(frame.height)}"/></clipPath>`,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(outWidth)}" height="${Math.round(outHeight)}"` +
    ` viewBox="${num(frame.x)} ${num(frame.y)} ${num(frame.width)} ${num(frame.height)}">` +
    `<defs>${fonts}${builder.defs.join("")}${builder.maskDefs()}</defs>${bg}<g clip-path="url(#${clipId})">${body}</g></svg>`
  );
}
