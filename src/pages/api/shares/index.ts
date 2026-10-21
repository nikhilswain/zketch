import type { APIRoute } from "astro";
import { createShare, type ShareEnv } from "../../../share/shareServer";

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore - Cloudflare runtime types
  const env = locals.runtime?.env;
  if (!env?.ZKETCH_SHARE_FILES || !env?.ZKETCH_SHARES) {
    return new Response(JSON.stringify({ error: "Storage not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const shareEnv = {
    bucket: env.ZKETCH_SHARE_FILES,
    kv: env.ZKETCH_SHARES,
  } as ShareEnv;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return createShare(form, ip, shareEnv, new URL(request.url).origin);
};
