import type { CacheLike } from "./edgeCache";
import { isGzip } from "./shareText";

export interface R2ObjectLike {
  body?: BodyInit | null;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface R2Like {
  put(
    key: string,
    body: Blob | ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(keys: string[]): Promise<unknown>;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<unknown>;
}

export interface ShareEnv {
  bucket: R2Like;
  kv: KVLike;
  cache?: CacheLike | null;
  waitUntil?: (task: Promise<unknown>) => void;
}

export interface ShareMeta {
  id: string;
  name: string;
  createdAt: number;
  allowContinue: boolean;
  previewWidth: number;
  previewHeight: number;
}

export type ShareFile = "drawing" | "picture.png" | "preview.jpg";

const MAX_DRAWING = 10 * 1024 * 1024;
const MAX_PICTURE = 8 * 1024 * 1024;
const MAX_PREVIEW = 400 * 1024;
const MAX_BODY = MAX_DRAWING + MAX_PICTURE + MAX_PREVIEW + 64 * 1024;
const MAX_NAME = 120;
const RATE_LIMIT = 20;
const ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const DRAWING_PREFIX = '{"format":"zketch"';
const CACHE_ORIGIN = "https://zketch-share-cache";
const CACHE_DAY = 86400;
const CACHE_MISSING = 60;
const BASE62 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const FILES: Record<ShareFile, { name: string; type: string }> = {
  drawing: { name: "drawing.zketch", type: "application/json" },
  "picture.png": { name: "picture.png", type: "image/png" },
  "preview.jpg": { name: "preview.jpg", type: "image/jpeg" },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function keyFor(id: string, file: ShareFile): string {
  return `shares/${id}/${FILES[file].name}`;
}

function fileCacheKey(id: string, file: ShareFile): string {
  return `${CACHE_ORIGIN}/files/${id}/${FILES[file].name}`;
}

function metaCacheKey(id: string): string {
  return `${CACHE_ORIGIN}/meta/${id}`;
}

async function cacheMatch(env: ShareEnv, key: string): Promise<Response | null> {
  if (!env.cache) return null;
  try {
    return (await env.cache.match(key)) ?? null;
  } catch (err) {
    console.error("Share cache read failed:", err);
    return null;
  }
}

async function cacheUpdate(
  env: ShareEnv,
  work: (cache: CacheLike) => Promise<unknown>
): Promise<void> {
  const cache = env.cache;
  if (!cache) return;
  const task = Promise.resolve()
    .then(() => work(cache))
    .catch((err) => console.error("Share cache update failed:", err));
  if (env.waitUntil) env.waitUntil(task);
  else await task;
}

function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += BASE62[b % BASE62.length];
  return id;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function hourStamp(date: Date): string {
  return date.toISOString().slice(0, 13).replace(/[-T]/g, "");
}

function asFile(value: FormDataEntryValue | null): File | null {
  return value && typeof value !== "string" ? value : null;
}

async function drawingTypeOf(drawing: File): Promise<string | null> {
  const head = new Uint8Array(await drawing.slice(0, 32).arrayBuffer());
  if (isGzip(head)) {
    return drawing.type === "application/gzip" ? "application/gzip" : null;
  }
  const isZketch = new TextDecoder().decode(head).startsWith(DRAWING_PREFIX);
  return isZketch && drawing.type === "application/json" ? "application/json" : null;
}

export function checkContentLength(header: string | null): Response | null {
  const length = header !== null && /^\d+$/.test(header) ? Number(header) : NaN;
  if (!(length <= MAX_BODY)) {
    return json({ error: "Share is too large" }, 413);
  }
  return null;
}

export async function checkRateLimit(
  ip: string,
  env: ShareEnv
): Promise<Response | null> {
  const rateKey = `rl:${ip}:${hourStamp(new Date())}`;
  try {
    const used = parseInt((await env.kv.get(rateKey)) ?? "0", 10) || 0;
    if (used >= RATE_LIMIT) {
      return json({ error: "Too many shares, try again later" }, 429);
    }
    await env.kv.put(rateKey, String(used + 1), { expirationTtl: 3600 });
  } catch (err) {
    console.error("Rate limit check failed:", err);
  }
  return null;
}

export async function createShare(
  form: FormData,
  env: ShareEnv,
  origin: string
): Promise<Response> {
  const drawing = asFile(form.get("drawing"));
  const picture = asFile(form.get("picture"));
  const preview = asFile(form.get("preview"));
  if (!drawing || !picture || !preview) {
    return json({ error: "Missing drawing, picture or preview" }, 400);
  }
  if (picture.type !== "image/png" || preview.type !== "image/jpeg") {
    return json({ error: "Wrong picture or preview type" }, 400);
  }
  if (
    drawing.size > MAX_DRAWING ||
    picture.size > MAX_PICTURE ||
    preview.size > MAX_PREVIEW
  ) {
    return json({ error: "Share is too large" }, 413);
  }
  const drawingType = await drawingTypeOf(drawing);
  if (!drawingType) {
    return json({ error: "Not a zketch drawing" }, 400);
  }

  const previewWidth = parseInt(String(form.get("previewWidth") ?? ""), 10);
  const previewHeight = parseInt(String(form.get("previewHeight") ?? ""), 10);
  if (
    !(previewWidth > 0 && previewWidth <= 10000) ||
    !(previewHeight > 0 && previewHeight <= 10000)
  ) {
    return json({ error: "Bad preview size" }, 400);
  }
  const rawName = String(form.get("name") ?? "").trim();
  if (rawName.length > MAX_NAME) {
    return json({ error: "Name is too long" }, 400);
  }
  const name = rawName || "Untitled drawing";
  const allowContinue = form.get("allowContinue") === "1" ? "1" : "0";

  const id = generateId();
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const deleteKey = base64url(keyBytes);
  const deleteKeyHash = await sha256hex(deleteKey);

  await env.bucket.put(keyFor(id, "picture.png"), picture, {
    httpMetadata: { contentType: "image/png" },
  });
  await env.bucket.put(keyFor(id, "preview.jpg"), preview, {
    httpMetadata: { contentType: "image/jpeg" },
  });
  await env.bucket.put(keyFor(id, "drawing"), drawing, {
    httpMetadata: { contentType: drawingType },
    customMetadata: {
      version: "1",
      name,
      allowContinue,
      previewWidth: String(previewWidth),
      previewHeight: String(previewHeight),
      createdAt: String(Date.now()),
      deleteKeyHash,
    },
  });

  return json({ id, url: `${origin}/share/${id}`, deleteKey }, 201);
}

export async function shareMeta(
  id: string,
  env: ShareEnv
): Promise<ShareMeta | null> {
  if (!ID_PATTERN.test(id)) return null;
  const cacheKey = metaCacheKey(id);
  const hit = await cacheMatch(env, cacheKey);
  const cached = hit ? await hit.json().catch(() => undefined) : undefined;
  if (cached !== undefined) return cached as ShareMeta | null;
  const object = await env.bucket.head(keyFor(id, "drawing"));
  const stored = object?.customMetadata;
  const meta: ShareMeta | null = stored
    ? {
        id,
        name: stored.name || "Untitled drawing",
        createdAt: Number(stored.createdAt) || 0,
        allowContinue: stored.allowContinue === "1",
        previewWidth: Number(stored.previewWidth) || 0,
        previewHeight: Number(stored.previewHeight) || 0,
      }
    : null;
  await cacheUpdate(env, (cache) =>
    cache.put(
      cacheKey,
      new Response(JSON.stringify(meta), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${meta ? CACHE_DAY : CACHE_MISSING}`,
        },
      })
    )
  );
  return meta;
}

export async function getShareFile(
  id: string,
  file: ShareFile,
  env: ShareEnv
): Promise<Response> {
  if (!ID_PATTERN.test(id) || !FILES[file]) {
    return new Response("Not found", { status: 404 });
  }
  const cacheKey = fileCacheKey(id, file);
  const hit = await cacheMatch(env, cacheKey);
  if (hit) return new Response(hit.body, hit);
  const object = await env.bucket.get(keyFor(id, file));
  if (!object || !object.body) {
    return new Response("Not found", { status: 404 });
  }
  const response = new Response(object.body, {
    status: 200,
    headers: {
      "content-type": object.httpMetadata?.contentType ?? FILES[file].type,
      "cache-control": `public, max-age=${CACHE_DAY}`,
      "x-content-type-options": "nosniff",
    },
  });
  if (env.cache) {
    const copy = response.clone();
    await cacheUpdate(env, (cache) => cache.put(cacheKey, copy));
  }
  return response;
}

export async function deleteShare(
  id: string,
  key: string,
  env: ShareEnv
): Promise<Response> {
  if (!ID_PATTERN.test(id)) return new Response("Not found", { status: 404 });
  const object = await env.bucket.head(keyFor(id, "drawing"));
  if (!object) return new Response("Not found", { status: 404 });
  const stored = object.customMetadata?.deleteKeyHash;
  if (!key || !stored || (await sha256hex(key)) !== stored) {
    return new Response("Forbidden", { status: 403 });
  }
  await env.bucket.delete([
    keyFor(id, "drawing"),
    keyFor(id, "picture.png"),
    keyFor(id, "preview.jpg"),
  ]);
  await cacheUpdate(env, (cache) =>
    Promise.all([
      cache.delete(fileCacheKey(id, "drawing")),
      cache.delete(fileCacheKey(id, "picture.png")),
      cache.delete(fileCacheKey(id, "preview.jpg")),
      cache.delete(metaCacheKey(id)),
    ])
  );
  return new Response(null, { status: 204 });
}
