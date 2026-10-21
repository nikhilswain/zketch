import type { APIRoute } from "astro";
import {
  deleteShare,
  getShareFile,
  type ShareEnv,
} from "../../../share/shareServer";

function envFrom(locals: unknown): ShareEnv | null {
  const env = (locals as any)?.runtime?.env;
  if (!env?.ZKETCH_SHARE_FILES || !env?.ZKETCH_SHARES) return null;
  return { bucket: env.ZKETCH_SHARE_FILES, kv: env.ZKETCH_SHARES } as ShareEnv;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const env = envFrom(locals);
  if (!env) return new Response("Storage not available", { status: 500 });
  return getShareFile(params.id ?? "", "drawing", env);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const env = envFrom(locals);
  if (!env) return new Response("Storage not available", { status: 500 });
  return deleteShare(
    params.id ?? "",
    request.headers.get("x-delete-key") ?? "",
    env
  );
};
