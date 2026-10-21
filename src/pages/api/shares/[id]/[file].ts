import type { APIRoute } from "astro";
import { getShareFile, type ShareEnv } from "../../../../share/shareServer";

export const GET: APIRoute = async ({ params, locals }) => {
  // @ts-ignore - Cloudflare runtime types
  const env = locals.runtime?.env;
  if (!env?.ZKETCH_SHARE_FILES || !env?.ZKETCH_SHARES) {
    return new Response("Storage not available", { status: 500 });
  }
  const file = params.file;
  if (file !== "picture.png" && file !== "preview.jpg") {
    return new Response("Not found", { status: 404 });
  }
  const shareEnv = {
    bucket: env.ZKETCH_SHARE_FILES,
    kv: env.ZKETCH_SHARES,
  } as ShareEnv;
  return getShareFile(params.id ?? "", file, shareEnv);
};
