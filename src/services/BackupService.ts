import type { ILayerData, ISavedDrawingData } from "@/models/VaultModel";
import type { IStoredBlob } from "./BlobStorageService";

export const BACKUP_EXTENSION = ".zketch";
const FORMAT = "zketch";
const VERSION = 1;

type FileDrawing = Omit<ISavedDrawingData, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type FileBlob = Omit<IStoredBlob, "blob" | "createdAt" | "size"> & {
  createdAt: string;
  data: string;
};

export interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  drawings: FileDrawing[];
  blobs: FileBlob[];
}

export interface ParsedBackup {
  drawings: ISavedDrawingData[];
  blobs: IStoredBlob[];
}

export interface ImportPlan extends ParsedBackup {
  skipped: number;
}

export function blobIdsOf(drawing: ISavedDrawingData): string[] {
  const ids = drawing.layers.flatMap((l) => (l.type === "image" && l.blobId ? [l.blobId] : []));
  if (drawing.thumbnail?.startsWith("thumb_")) ids.push(drawing.thumbnail);
  return [...new Set(ids)];
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

function fromBase64(data: string, type: string): Blob {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function packBackup(
  drawings: ISavedDrawingData[],
  getBlob: (id: string) => Promise<IStoredBlob | undefined>,
): Promise<BackupFile> {
  const blobs: FileBlob[] = [];
  const seen = new Set<string>();
  for (const d of drawings) {
    for (const id of blobIdsOf(d)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const stored = await getBlob(id);
      if (!stored) continue;
      blobs.push({
        id: stored.id,
        mimeType: stored.mimeType,
        originalName: stored.originalName,
        width: stored.width,
        height: stored.height,
        createdAt: new Date(stored.createdAt).toISOString(),
        data: await toBase64(stored.blob),
      });
    }
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    drawings: drawings.map((d) => ({
      ...d,
      createdAt: new Date(d.createdAt).toISOString(),
      updatedAt: new Date(d.updatedAt).toISOString(),
    })),
    blobs,
  };
}

export function parseBackup(text: string): ParsedBackup {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("This isn't a zketch file.");
  }
  if (!file || file.format !== FORMAT || !Array.isArray(file.drawings) || !Array.isArray(file.blobs)) {
    throw new Error("This isn't a zketch file.");
  }
  if (typeof file.version !== "number" || file.version > VERSION) {
    throw new Error("This file is from a newer version of zketch.");
  }
  const drawings = file.drawings
    .filter((d) => d && typeof d.id === "string" && Array.isArray(d.layers))
    .map((d) => ({
      ...d,
      name: typeof d.name === "string" && d.name ? d.name : "Untitled Drawing",
      thumbnail: typeof d.thumbnail === "string" ? d.thumbnail : "",
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
    }));
  const blobs = file.blobs
    .filter((b) => b && typeof b.id === "string" && typeof b.data === "string")
    .map((b) => {
      const blob = fromBase64(b.data, b.mimeType);
      return {
        id: b.id,
        blob,
        mimeType: b.mimeType,
        originalName: b.originalName,
        width: b.width,
        height: b.height,
        size: blob.size,
        createdAt: new Date(b.createdAt),
      };
    });
  return { drawings, blobs };
}

function remapBlobs(drawing: ISavedDrawingData, map: Map<string, string>): ISavedDrawingData {
  const swap = (id: string) => map.get(id) ?? id;
  return {
    ...drawing,
    thumbnail: swap(drawing.thumbnail),
    layers: drawing.layers.map((l): ILayerData => (l.type === "image" ? { ...l, blobId: swap(l.blobId) } : l)),
  };
}

export function planImport(
  backup: ParsedBackup,
  existingDrawings: Map<string, number>,
  existingBlobIds: Set<string>,
  newId: (kind: "drawing" | "blob" | "thumb") => string,
): ImportPlan {
  const blobsById = new Map(backup.blobs.map((b) => [b.id, b]));
  const drawings: ISavedDrawingData[] = [];
  const blobs: IStoredBlob[] = [];
  let skipped = 0;
  for (const original of backup.drawings) {
    const known = existingDrawings.get(original.id);
    if (known !== undefined && known === original.updatedAt.getTime()) {
      skipped++;
      continue;
    }
    const map = new Map<string, string>();
    for (const id of blobIdsOf(original)) {
      const stored = blobsById.get(id);
      if (!stored) continue;
      const id2 = existingBlobIds.has(id) ? newId(id.startsWith("thumb_") ? "thumb" : "blob") : id;
      map.set(id, id2);
      existingBlobIds.add(id2);
      blobs.push({ ...stored, id: id2 });
    }
    const drawing = remapBlobs(original, map);
    if (known !== undefined) {
      drawing.id = newId("drawing");
      drawing.name = `${original.name} (copy)`;
    }
    existingDrawings.set(drawing.id, drawing.updatedAt.getTime());
    drawings.push(drawing);
  }
  return { drawings, blobs, skipped };
}

export function backupFileName(drawings: { name: string }[]): string {
  if (drawings.length === 1) {
    const base = drawings[0].name.replace(/[\\/:*?"<>|]+/g, "").trim() || "drawing";
    return base + BACKUP_EXTENSION;
  }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `zketch-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${BACKUP_EXTENSION}`;
}
