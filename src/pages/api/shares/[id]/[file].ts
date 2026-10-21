import type { APIRoute } from "astro";
import { getShareFile } from "../../../../share/shareServer";
import { shareEnvFrom } from "../../../../share/shareEnv";

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = (locals as any)?.runtime;
  const shareEnv = shareEnvFrom(runtime?.env, runtime?.ctx);
  if (!shareEnv) {
    return new Response("Storage not available", { status: 500 });
  }
  const file = params.file;
  if (file !== "picture.png" && file !== "preview.jpg") {
    return new Response("Not found", { status: 404 });
  }
  return getShareFile(params.id ?? "", file, shareEnv);
};
