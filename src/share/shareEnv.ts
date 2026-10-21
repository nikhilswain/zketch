import { b2Bucket } from "./b2Bucket";
import type { KVLike, R2Like, ShareEnv } from "./shareServer";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function shareEnvFrom(env: Record<string, unknown> | undefined): ShareEnv | null {
  const kv = env?.ZKETCH_SHARES as KVLike | undefined;
  if (!env || !kv) return null;
  const endpoint = text(env.ZKETCH_B2_ENDPOINT);
  const keyId = text(env.ZKETCH_B2_KEY_ID);
  const appKey = text(env.ZKETCH_B2_APP_KEY);
  const bucket = text(env.ZKETCH_B2_BUCKET);
  if (endpoint && keyId && appKey && bucket) {
    return { bucket: b2Bucket({ endpoint, keyId, appKey, bucket }), kv };
  }
  const r2 = env.ZKETCH_SHARE_FILES as R2Like | undefined;
  return r2 ? { bucket: r2, kv } : null;
}
