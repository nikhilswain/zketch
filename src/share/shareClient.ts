import { BlobStorageService } from "@/services/BlobStorageService";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { buildShareFile, renderSharePictures, stripForShare, MAX_SHARE_BYTES } from "./sharePayload";
import { gzipShareText } from "./shareText";

export type SharedLink = {
  id: string;
  url: string;
  deleteKey: string;
  drawingId: string | null;
  createdAt: number;
  allowContinue: boolean;
  contentHash?: string;
  name?: string;
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

export function listAllShares(): SharedLink[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
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

export async function shareHash(drawing: ISavedDrawingData): Promise<string> {
  const { layers } = stripForShare(drawing, "");
  const stable = JSON.stringify({
    name: drawing.name,
    background: drawing.background,
    page: drawing.page ?? null,
    layers,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function findReusable(
  drawingId: string | null,
  contentHash: string,
  allowContinue: boolean
): SharedLink | undefined {
  if (drawingId === null) return undefined;
  return listShares(drawingId).find((l) => l.contentHash === contentHash && l.allowContinue === allowContinue);
}

export async function createShareLink(input: {
  drawing: ISavedDrawingData;
  allowContinue: boolean;
  drawingId: string | null;
}): Promise<{ link: SharedLink; reused: boolean }> {
  const { drawing, allowContinue, drawingId } = input;
  const contentHash = await shareHash(drawing);
  const existing = findReusable(drawingId, contentHash, allowContinue);
  if (existing) return { link: existing, reused: true };
  const file = await buildShareFile(drawing, (id) => BlobStorageService.getBlob(id), crypto.randomUUID());
  const packed = await gzipShareText(JSON.stringify(file));
  if (packed.size > MAX_SHARE_BYTES) throw new Error("too large");

  const { picture, preview, previewWidth, previewHeight } = await renderSharePictures(drawing);
  const form = new FormData();
  form.append("drawing", new File([packed], "drawing.zketch", { type: "application/gzip" }));
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
    contentHash,
    name: drawing.name,
  };
  rememberShare(link);
  return { link, reused: false };
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

export async function setShareContinue(link: SharedLink, allowContinue: boolean): Promise<SharedLink> {
  const response = await fetch(`/api/shares/${encodeURIComponent(link.id)}`, {
    method: "PATCH",
    headers: { "x-delete-key": link.deleteKey, "content-type": "application/json" },
    body: JSON.stringify({ allowContinue }),
  });
  if (response.status === 404) {
    forgetShare(link.id);
    throw new Error("gone");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  const current = readAll().find((l) => l.id === link.id) ?? link;
  const updated = { ...current, allowContinue };
  writeAll(readAll().map((l) => (l.id === link.id ? updated : l)));
  return updated;
}

export async function unshareLinks(links: SharedLink[]): Promise<{ removed: number; failed: number }> {
  const queue = [...links];
  let removed = 0;
  let failed = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await unshareLink(next);
        removed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return { removed, failed };
}
