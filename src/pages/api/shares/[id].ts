import type { APIRoute } from "astro";
import { deleteShare, getShareFile } from "../../../share/shareServer";
import { shareEnvFrom } from "../../../share/shareEnv";

export const GET: APIRoute = async ({ params, locals }) => {
  const env = shareEnvFrom((locals as any)?.runtime?.env);
  if (!env) return new Response("Storage not available", { status: 500 });
  return getShareFile(params.id ?? "", "drawing", env);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const env = shareEnvFrom((locals as any)?.runtime?.env);
  if (!env) return new Response("Storage not available", { status: 500 });
  return deleteShare(
    params.id ?? "",
    request.headers.get("x-delete-key") ?? "",
    env
  );
};
