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

async function fail(method: string, key: string, response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");
  throw new Error(`B2 ${method} ${key} failed (${response.status}) ${detail.slice(0, 200)}`);
}

export function b2Bucket(cfg: B2Config, fetchFn: typeof fetch = fetch): R2Like {
  const host = cfg.endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const region = host.match(/^s3\.([^.]+)\./)?.[1] ?? "";
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
      const bytes = await new Response(body).arrayBuffer();
      const response = await send("PUT", key, { headers, body: bytes });
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
      for (const key of keys) {
        const response = await send("DELETE", key);
        if (!response.ok && response.status !== 404) await fail("DELETE", key, response);
        await response.body?.cancel();
      }
    },
  };
}
