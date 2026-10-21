import { AwsClient } from "aws4fetch";
import type { R2Like, R2ObjectLike } from "./shareServer";

export interface B2Config {
  endpoint: string;
  keyId: string;
  appKey: string;
  bucket: string;
}

const META_HEADER = "x-amz-meta-zk";

function encodeMeta(meta: Record<string, string>): string {
  let bin = "";
  for (const b of new TextEncoder().encode(JSON.stringify(meta))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeMeta(value: string | null): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

function versionIdsFor(xml: string, key: string): string[] {
  const ids: string[] = [];
  for (const entry of xml.matchAll(/<(Version|DeleteMarker)>([\s\S]*?)<\/\1>/g)) {
    const entryKey = entry[2].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const versionId = entry[2].match(/<VersionId>([\s\S]*?)<\/VersionId>/)?.[1];
    if (entryKey !== undefined && versionId !== undefined && unescapeXml(entryKey) === key) {
      ids.push(unescapeXml(versionId));
    }
  }
  return ids;
}

async function fail(method: string, key: string, response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");
  throw new Error(`B2 ${method} ${key} failed (${response.status}) ${detail.slice(0, 200)}`);
}

export function b2Bucket(cfg: B2Config, fetchFn: typeof fetch = fetch): R2Like {
  const host = cfg.endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const region = host.match(/^s3\.([^.]+)\./)?.[1];
  if (!region) {
    throw new Error("Backblaze endpoint should look like s3.<region>.backblazeb2.com");
  }
  const client = new AwsClient({
    accessKeyId: cfg.keyId,
    secretAccessKey: cfg.appKey,
    service: "s3",
    region,
  });
  const urlFor = (key: string) =>
    `https://${host}/${encodeURIComponent(cfg.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const send = async (method: string, key: string, init: RequestInit = {}) =>
    fetchFn(await client.sign(urlFor(key), { ...init, method }));

  const read = (response: Response, body: R2ObjectLike["body"]): R2ObjectLike => ({
    body,
    httpMetadata: { contentType: response.headers.get("content-type") ?? undefined },
    customMetadata: decodeMeta(response.headers.get(META_HEADER)),
  });

  return {
    async put(key, body, options) {
      const headers: Record<string, string> = {};
      const type = options?.httpMetadata?.contentType;
      if (type) headers["content-type"] = type;
      if (options?.customMetadata) headers[META_HEADER] = encodeMeta(options.customMetadata);
      const payload = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body;
      const response = await send("PUT", key, { headers, body: payload });
      if (!response.ok) await fail("PUT", key, response);
      await response.body?.cancel();
    },
    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) await fail("GET", key, response);
      return read(response, response.body);
    },
    async head(key) {
      const response = await send("HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) await fail("HEAD", key, response);
      return read(response, undefined);
    },
    async delete(keys) {
      const remove = async (key: string, query = "") => {
        const response = await fetchFn(await client.sign(urlFor(key) + query, { method: "DELETE" }));
        if (!response.ok && response.status !== 404) await fail("DELETE", key, response);
        await response.body?.cancel();
      };
      for (const key of keys) {
        const listing = await fetchFn(
          await client.sign(
            `https://${host}/${encodeURIComponent(cfg.bucket)}?versions&prefix=${encodeURIComponent(key)}`,
            { method: "GET" }
          )
        );
        if (!listing.ok) await fail("LIST", key, listing);
        const ids = versionIdsFor(await listing.text(), key);
        if (ids.length === 0) {
          await remove(key);
          continue;
        }
        for (const id of ids) await remove(key, `?versionId=${encodeURIComponent(id)}`);
      }
    },
  };
}
