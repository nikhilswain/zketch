import { b2Bucket } from "./b2Bucket";
import { edgeCache } from "./edgeCache";
import type { KVLike, R2Like, ShareEnv } from "./shareServer";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

interface RuntimeContext {
  waitUntil?(task: Promise<unknown>): void;
}

function bucketFrom(env: Record<string, unknown>): R2Like | null {
  const endpoint = text(env.ZKETCH_B2_ENDPOINT);
  const keyId = text(env.ZKETCH_B2_KEY_ID);
  const appKey = text(env.ZKETCH_B2_APP_KEY);
  const bucket = text(env.ZKETCH_B2_BUCKET);
  if (endpoint && keyId && appKey && bucket) {
    return b2Bucket({ endpoint, keyId, appKey, bucket });
  }
  return (env.ZKETCH_SHARE_FILES as R2Like | undefined) ?? null;
}

export function shareEnvFrom(
  env: Record<string, unknown> | undefined,
  ctx?: RuntimeContext
): ShareEnv | null {
  const kv = env?.ZKETCH_SHARES as KVLike | undefined;
  const bucket = env && kv ? bucketFrom(env) : null;
  if (!kv || !bucket) return null;
  return {
    bucket,
    kv,
    cache: edgeCache(),
    waitUntil: ctx?.waitUntil ? (task) => ctx.waitUntil!(task) : undefined,
  };
}
