import type { APIRoute } from "astro";
import { oembed } from "../../share/oembed";
import { shareMeta } from "../../share/shareServer";
import { shareEnvFrom } from "../../share/shareEnv";

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any)?.runtime;
  const env = shareEnvFrom(runtime?.env, runtime?.ctx);
  if (!env) return new Response("Storage not available", { status: 500 });
  const url = new URL(request.url);
  return oembed(url.searchParams, url.origin, (id) => shareMeta(id, env));
};
