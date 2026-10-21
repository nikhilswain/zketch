import { BlobStorageService } from "@/services/BlobStorageService";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { buildShareFile, renderSharePictures, MAX_SHARE_BYTES } from "./sharePayload";

export type SharedLink = {
  id: string;
  url: string;
  deleteKey: string;
  drawingId: string | null;
  createdAt: number;
  allowContinue: boolean;
};

const STORAGE_KEY = "zketch-shares-v1";

function readAll(): SharedLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.id === "string") : [];
  } catch {
    return [];
  }
}

function writeAll(links: SharedLink[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    return;
  }
}

export function listShares(drawingId: string | null): SharedLink[] {
  return readAll()
    .filter((l) => l.drawingId === drawingId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function rememberShare(link: SharedLink): void {
  writeAll([link, ...readAll().filter((l) => l.id !== link.id)]);
}

export function forgetShare(id: string): void {
  writeAll(readAll().filter((l) => l.id !== id));
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    return `Request failed (${response.status})`;
  }
  return `Request failed (${response.status})`;
}

export async function createShareLink(input: {
  drawing: ISavedDrawingData;
  allowContinue: boolean;
  drawingId: string | null;
}): Promise<SharedLink> {
  const { drawing, allowContinue, drawingId } = input;
  const file = await buildShareFile(drawing, (id) => BlobStorageService.getBlob(id), crypto.randomUUID());
  const json = JSON.stringify(file);
  if (new Blob([json]).size > MAX_SHARE_BYTES) throw new Error("too large");

  const { picture, preview, previewWidth, previewHeight } = await renderSharePictures(drawing);
  const form = new FormData();
  form.append("drawing", new File([json], "drawing.zketch", { type: "application/json" }));
  form.append("picture", picture, "picture.png");
  form.append("preview", preview, "preview.jpg");
  form.append("previewWidth", String(previewWidth));
  form.append("previewHeight", String(previewHeight));
  form.append("name", drawing.name);
  form.append("allowContinue", allowContinue ? "1" : "0");

  const response = await fetch("/api/shares", { method: "POST", body: form });
  if (response.status === 413) throw new Error("too large");
  if (response.status === 429) throw new Error("rate limited");
  if (!response.ok) throw new Error(await errorMessage(response));

  const body = (await response.json()) as { id: string; url: string; deleteKey: string };
  const link: SharedLink = {
    id: body.id,
    url: body.url,
    deleteKey: body.deleteKey,
    drawingId,
    createdAt: Date.now(),
    allowContinue,
  };
  rememberShare(link);
  return link;
}

export async function unshareLink(link: SharedLink): Promise<void> {
  const response = await fetch(`/api/shares/${encodeURIComponent(link.id)}`, {
    method: "DELETE",
    headers: { "x-delete-key": link.deleteKey },
  });
  if (response.status === 204 || response.status === 404) {
    forgetShare(link.id);
    return;
  }
  throw new Error(await errorMessage(response));
}
