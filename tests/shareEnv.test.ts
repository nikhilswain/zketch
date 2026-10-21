import { describe, it, expect, vi, afterEach } from "vitest";
import { shareEnvFrom } from "../src/share/shareEnv";

const kv = { get: async () => null, put: async () => undefined };
const r2 = {
  put: async () => undefined,
  get: async () => null,
  head: async () => null,
  delete: async () => undefined,
};
const B2 = {
  ZKETCH_B2_ENDPOINT: "s3.us-west-004.backblazeb2.com",
  ZKETCH_B2_KEY_ID: "004abc",
  ZKETCH_B2_APP_KEY: "K004secret",
  ZKETCH_B2_BUCKET: "zketch-shares",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shareEnvFrom", () => {
  it("uses B2 when all four variables are set", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: Request) => {
      urls.push(input.url);
      return new Response(null, { status: 404 });
    });
    const env = shareEnvFrom({ ZKETCH_SHARES: kv, ZKETCH_SHARE_FILES: r2, ...B2 });
    expect(env).not.toBeNull();
    expect(env!.kv).toBe(kv);
    expect(env!.bucket).not.toBe(r2);
    expect(await env!.bucket.head("shares/abc/drawing.zketch")).toBeNull();
    expect(urls).toEqual([
      "https://s3.us-west-004.backblazeb2.com/zketch-shares/shares/abc/drawing.zketch",
    ]);
  });

  it("falls back to the R2 binding when a B2 variable is missing", () => {
    const env = shareEnvFrom({ ZKETCH_SHARES: kv, ZKETCH_SHARE_FILES: r2, ...B2, ZKETCH_B2_APP_KEY: "" });
    expect(env?.bucket).toBe(r2);
  });

  it("is null without KV or without any bucket", () => {
    expect(shareEnvFrom({ ZKETCH_SHARE_FILES: r2, ...B2 })).toBeNull();
    expect(shareEnvFrom({ ZKETCH_SHARES: kv })).toBeNull();
    expect(shareEnvFrom(undefined)).toBeNull();
  });
});
