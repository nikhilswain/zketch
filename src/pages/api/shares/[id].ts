import type { APIRoute } from "astro";
import { deleteShare, getShareFile, updateShare } from "../../../share/shareServer";
import { shareEnvFrom } from "../../../share/shareEnv";

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = (locals as any)?.runtime;
  const env = shareEnvFrom(runtime?.env, runtime?.ctx);
  if (!env) return new Response("Storage not available", { status: 500 });
  return getShareFile(params.id ?? "", "drawing", env);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const runtime = (locals as any)?.runtime;
  const env = shareEnvFrom(runtime?.env, runtime?.ctx);
  if (!env) return new Response("Storage not available", { status: 500 });
  return deleteShare(
    params.id ?? "",
    request.headers.get("x-delete-key") ?? "",
    env
  );
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const runtime = (locals as any)?.runtime;
  const env = shareEnvFrom(runtime?.env, runtime?.ctx);
  if (!env) return new Response("Storage not available", { status: 500 });
  const header = request.headers.get("content-length");
  const length = header !== null && /^\d+$/.test(header) ? Number(header) : NaN;
  if (!(length > 0)) return new Response("Bad request", { status: 400 });
  if (length > 1024) return new Response("Too large", { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = null;
  }
  return updateShare(
    params.id ?? "",
    request.headers.get("x-delete-key") ?? "",
    body,
    env
  );
};
