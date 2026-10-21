import { packBackup, type BackupFile } from "@/services/BackupService";
import type { IStoredBlob } from "@/services/BlobStorageService";
import { ExportService, type IExportLayer } from "@/services/ExportService";
import type { BackgroundType } from "@/models/CanvasModel";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { shareFrame } from "./ReplayRenderer";

export const MAX_SHARE_BYTES = 10 * 1024 * 1024;

const PICTURE_LONG_SIDE = 1600;
const PREVIEW_LONG_SIDE = 1200;
const PREVIEW_MAX_BYTES = 300 * 1024;
const PREVIEW_START_QUALITY = 0.85;
const PREVIEW_MIN_QUALITY = 0.45;
const PREVIEW_MIN_LONG_SIDE = 320;

export function stripForShare(drawing: ISavedDrawingData, newId: string): ISavedDrawingData {
  const layers = drawing.layers.filter((l) => l.visible);
  return {
    ...drawing,
    id: newId,
    thumbnail: "",
    layers,
    activeLayerId: layers[0]?.id ?? "",
  };
}

export function buildShareFile(
  drawing: ISavedDrawingData,
  getBlob: (id: string) => Promise<IStoredBlob | undefined>,
  newId: string,
): Promise<BackupFile> {
  return packBackup([stripForShare(drawing, newId)], async (id) => {
    const stored = await getBlob(id);
    return stored ? cleanImage(stored) : undefined;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), type, quality);
  });
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

async function decodeImage(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const img = await loadImageElement(blob);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  }
}

async function cleanImage(stored: IStoredBlob): Promise<IStoredBlob> {
  const clean = { ...stored, originalName: "" };
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return clean;
  const mimeType = stored.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const image = await decodeImage(stored.blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.width || stored.width);
    canvas.height = Math.max(1, image.height || stored.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, mimeType, mimeType === "image/jpeg" ? 0.92 : undefined);
    canvas.width = 0;
    canvas.height = 0;
    return { ...clean, blob, mimeType, size: blob.size };
  } finally {
    image.close();
  }
}

function exportLayers(drawing: ISavedDrawingData): IExportLayer[] {
  const out: IExportLayer[] = [];
  for (const layer of drawing.layers) {
    if (!layer.visible) continue;
    if (layer.type === "draw") {
      out.push({ type: "draw", visible: true, opacity: layer.opacity, elements: layer.elements as any[] });
    } else if (layer.type === "stroke") {
      out.push({ type: "draw", visible: true, opacity: layer.opacity, elements: (layer.strokes ?? []) as any[] });
    } else if (layer.type === "image") {
      out.push({
        type: "image",
        visible: true,
        opacity: layer.opacity,
        imageData: {
          blobId: layer.blobId,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
          opacity: layer.opacity,
          visible: true,
        },
      });
    }
  }
  return out;
}

export async function renderSharePictures(
  drawing: ISavedDrawingData,
): Promise<{ picture: Blob; preview: Blob; previewWidth: number; previewHeight: number }> {
  const frame = shareFrame(drawing);
  const longSide = Math.max(frame.width, frame.height);
  const scale = Math.min(1, PICTURE_LONG_SIDE / longSide);
  const canvas = await ExportService.renderPageToCanvas(
    exportLayers(drawing),
    frame,
    scale,
    drawing.background as BackgroundType,
    false,
  );
  const picture = await toBlob(canvas, "image/png");

  const shrink = Math.min(1, PREVIEW_LONG_SIDE / Math.max(canvas.width, canvas.height));
  let previewWidth = Math.max(1, Math.round(canvas.width * shrink));
  let previewHeight = Math.max(1, Math.round(canvas.height * shrink));

  const draw = (w: number, h: number): HTMLCanvasElement => {
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const ctx = small.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(canvas, 0, 0, w, h);
    return small;
  };

  let small = draw(previewWidth, previewHeight);
  let quality = PREVIEW_START_QUALITY;
  let preview = await toBlob(small, "image/jpeg", quality);
  while (preview.size > PREVIEW_MAX_BYTES && quality - 0.1 >= PREVIEW_MIN_QUALITY - 1e-9) {
    quality -= 0.1;
    preview = await toBlob(small, "image/jpeg", quality);
  }
  while (preview.size > PREVIEW_MAX_BYTES && Math.max(previewWidth, previewHeight) * 0.85 >= PREVIEW_MIN_LONG_SIDE) {
    previewWidth = Math.max(1, Math.round(previewWidth * 0.85));
    previewHeight = Math.max(1, Math.round(previewHeight * 0.85));
    small = draw(previewWidth, previewHeight);
    preview = await toBlob(small, "image/jpeg", quality);
  }
  return { picture, preview, previewWidth, previewHeight };
}
