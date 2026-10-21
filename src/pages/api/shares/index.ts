import type { APIRoute } from "astro";
import {
  checkContentLength,
  checkRateLimit,
  createShare,
} from "../../../share/shareServer";
import { shareEnvFrom } from "../../../share/shareEnv";

export const POST: APIRoute = async ({ request, locals }) => {
  const shareEnv = shareEnvFrom((locals as any)?.runtime?.env);
  if (!shareEnv) {
    return new Response(JSON.stringify({ error: "Storage not available" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const tooLarge = checkContentLength(request.headers.get("content-length"));
  if (tooLarge) return tooLarge;
  const limited = await checkRateLimit(ip, shareEnv);
  if (limited) return limited;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return createShare(form, shareEnv, new URL(request.url).origin);
};
