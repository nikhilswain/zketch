import { EMBED_WIDTH, STRIP_PX, embedSize, iframeCode } from "./embedCode";
import type { ShareMeta } from "./shareServer";

const PATH = /^\/(?:share|embed)\/([A-Za-z0-9]{12})\/?$/;
const CACHE_SECONDS = 60;

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function limit(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

export function shareIdFrom(url: string | null, origin: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  return PATH.exec(parsed.pathname)?.[1] ?? null;
}

export async function oembed(
  query: URLSearchParams,
  origin: string,
  lookup: (id: string) => Promise<ShareMeta | null>,
): Promise<Response> {
  const format = query.get("format");
  if (format && format !== "json") return new Response("Not implemented", { status: 501 });
  const id = shareIdFrom(query.get("url"), origin);
  if (!id) return notFound();
  let meta: ShareMeta | null;
  try {
    meta = await lookup(id);
  } catch (err) {
    console.error("Failed to read share:", err);
    return notFound();
  }
  if (!meta) return notFound();

  const aspect = { width: meta.previewWidth, height: meta.previewHeight };
  const ratio = aspect.width > 0 && aspect.height > 0 ? aspect.width / aspect.height : 4 / 3;
  const maxWidth = limit(query.get("maxwidth"));
  const maxHeight = limit(query.get("maxheight"));
  if (maxHeight !== null && maxHeight <= STRIP_PX) return notFound();
  let width = Math.min(EMBED_WIDTH, maxWidth ?? EMBED_WIDTH);
  let size = embedSize(aspect, "tap", width);
  if (maxHeight !== null && size.height > maxHeight) {
    width = Math.max(1, Math.floor((maxHeight - STRIP_PX) * ratio));
    size = embedSize(aspect, "tap", width);
    while (size.height > maxHeight && width > 1) {
      width--;
      size = embedSize(aspect, "tap", width);
    }
    if (size.height > maxHeight) return notFound();
  }

  const body = {
    type: "rich",
    version: "1.0",
    title: meta.name,
    provider_name: "zketch",
    provider_url: origin,
    html: iframeCode({ origin, id, name: meta.name, mode: "tap", loop: false, aspect }),
    width: size.width,
    height: size.height,
    thumbnail_url: `${origin}/api/shares/${id}/preview.jpg`,
    ...(meta.previewWidth > 0 && meta.previewHeight > 0
      ? { thumbnail_width: meta.previewWidth, thumbnail_height: meta.previewHeight }
      : {}),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
      "access-control-allow-origin": "*",
    },
  });
}
