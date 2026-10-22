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
  const meta = await lookup(id);
  if (!meta) return notFound();

  const aspect = { width: meta.previewWidth, height: meta.previewHeight };
  const ratio = aspect.width > 0 && aspect.height > 0 ? aspect.width / aspect.height : 4 / 3;
  const maxWidth = limit(query.get("maxwidth"));
  const maxHeight = limit(query.get("maxheight"));
  let width = Math.min(EMBED_WIDTH, maxWidth ?? EMBED_WIDTH);
  let size = embedSize(aspect, "tap", width);
  if (maxHeight !== null && size.height > maxHeight) {
    width = Math.max(1, Math.floor(Math.max(1, maxHeight - STRIP_PX) * ratio));
    size = embedSize(aspect, "tap", width);
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
    thumbnail_width: meta.previewWidth,
    thumbnail_height: meta.previewHeight,
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
