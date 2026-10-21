import { describe, it, expect, vi } from "vitest";
import {
  createShare,
  checkContentLength,
  checkRateLimit,
  shareMeta,
  getShareFile,
  deleteShare,
  updateShare,
  type R2Like,
  type KVLike,
  type ShareEnv,
} from "../src/share/shareServer";
import type { CacheLike } from "../src/share/edgeCache";
import { gzipShareText, readShareText } from "../src/share/shareText";

function makeEnv() {
  const objects = new Map<
    string,
    { data: Blob; httpMetadata?: any; customMetadata?: Record<string, string> }
  >();
  const kvStore = new Map<string, string>();
  const calls = { get: 0, head: 0 };
  const bucket: R2Like = {
    async put(key, body, opts) {
      objects.set(key, {
        data: await new Response(body as any).blob(),
        httpMetadata: opts?.httpMetadata,
        customMetadata: opts?.customMetadata,
      });
    },
    async get(key) {
      calls.get++;
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: o.data.stream(),
        httpMetadata: o.httpMetadata,
        customMetadata: o.customMetadata,
      };
    },
    async head(key) {
      calls.head++;
      const o = objects.get(key);
      if (!o) return null;
      return { httpMetadata: o.httpMetadata, customMetadata: o.customMetadata };
    },
    async delete(keys) {
      for (const k of keys) objects.delete(k);
    },
  };
  const kv: KVLike = {
    async get(key) {
      return kvStore.get(key) ?? null;
    },
    async put(key, value) {
      kvStore.set(key, value);
    },
    async delete(key) {
      kvStore.delete(key);
    },
  };
  const env: ShareEnv = { bucket, kv };
  return { env, objects, calls, kvStore };
}

function makeCache() {
  const entries = new Map<string, Response>();
  const cache: CacheLike = {
    async match(key) {
      return entries.get(key)?.clone();
    },
    async put(key, response) {
      entries.set(key, new Response(await response.arrayBuffer(), response));
    },
    async delete(key) {
      return entries.delete(key);
    },
  };
  return { cache, entries };
}

const DRAWING = '{"format":"zketch","version":1,"layers":[]}';

function form(over: { drawing?: Blob; drawingType?: string } = {}) {
  const f = new FormData();
  f.set(
    "drawing",
    new File([over.drawing ?? DRAWING], "d.zketch", {
      type: over.drawingType ?? "application/json",
    })
  );
  f.set("picture", new File([new Uint8Array([1, 2, 3])], "p.png", { type: "image/png" }));
  f.set("preview", new File([new Uint8Array([4, 5])], "p.jpg", { type: "image/jpeg" }));
  f.set("previewWidth", "800");
  f.set("previewHeight", "600");
  f.set("name", "My cat");
  f.set("allowContinue", "1");
  return f;
}

describe("shareServer", () => {
  it("stores a valid share and returns a delete key", async () => {
    const { env, objects } = makeEnv();
    const res = await createShare(form(), env, "https://z.test");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.url).toBe(`https://z.test/share/${body.id}`);
    expect(body.deleteKey.length).toBeGreaterThanOrEqual(40);
    expect(objects.has(`shares/${body.id}/drawing.zketch`)).toBe(true);
    expect(objects.has(`shares/${body.id}/picture.png`)).toBe(true);
    expect(objects.has(`shares/${body.id}/preview.jpg`)).toBe(true);
    const meta = objects.get(`shares/${body.id}/drawing.zketch`)!.customMetadata!;
    expect(meta.allowContinue).toBe("1");
    expect(meta.name).toBe("My cat");
    expect(meta.deleteKeyHash).not.toBe(body.deleteKey);
  });

  it("rejects a non-zketch drawing", async () => {
    const { env } = makeEnv();
    const res = await createShare(form({ drawing: new Blob(['{"hello":1}']) }), env, "https://z.test");
    expect(res.status).toBe(400);
  });

  it("rejects oversized drawing", async () => {
    const { env } = makeEnv();
    const big = new Blob([DRAWING, new Uint8Array(10 * 1024 * 1024 + 1 - DRAWING.length)]);
    const res = await createShare(form({ drawing: big }), env, "https://z.test");
    expect(res.status).toBe(413);
  });

  it("rate limits after 20 shares an hour, before any body is read", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < 20; i++) {
      expect(await checkRateLimit("2.2.2.2", env)).toBeNull();
    }
    const res = await checkRateLimit("2.2.2.2", env);
    expect(res?.status).toBe(429);
    expect(await checkRateLimit("3.3.3.3", env)).toBeNull();
  });

  it("allows sharing when the rate limit store fails", async () => {
    const { env } = makeEnv();
    const broken: KVLike = {
      get: async () => {
        throw new Error("kv down");
      },
      put: async () => {
        throw new Error("kv down");
      },
      delete: async () => {
        throw new Error("kv down");
      },
    };
    expect(await checkRateLimit("4.4.4.4", { ...env, kv: broken })).toBeNull();
  });

  it("content-length guard rejects missing, bad and oversized bodies", () => {
    expect(checkContentLength(null)?.status).toBe(413);
    expect(checkContentLength("abc")?.status).toBe(413);
    expect(checkContentLength(String(30 * 1024 * 1024))?.status).toBe(413);
    expect(checkContentLength("5000")).toBeNull();
  });

  it("stores a version in the metadata", async () => {
    const { env, objects } = makeEnv();
    const { id } = await (await createShare(form(), env, "https://z.test")).json();
    expect(objects.get(`shares/${id}/drawing.zketch`)!.customMetadata!.version).toBe("1");
  });

  it("meta and files come back", async () => {
    const { env } = makeEnv();
    const { id } = await (await createShare(form(), env, "https://z.test")).json();
    const meta = await shareMeta(id, env);
    expect(meta?.name).toBe("My cat");
    expect(meta?.allowContinue).toBe(true);
    expect(meta?.previewWidth).toBe(800);
    const res = await getShareFile(id, "preview.jpg", env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("delete needs the right key", async () => {
    const { env, objects } = makeEnv();
    const { id, deleteKey } = await (await createShare(form(), env, "https://z.test")).json();
    expect((await deleteShare(id, "wrong", env)).status).toBe(403);
    expect(objects.size).toBe(3);
    expect((await deleteShare(id, deleteKey, env)).status).toBe(204);
    expect(objects.size).toBe(0);
    expect((await getShareFile(id, "drawing", env)).status).toBe(404);
  });

  it("bad ids are 404", async () => {
    const { env } = makeEnv();
    expect((await getShareFile("../x", "drawing", env)).status).toBe(404);
  });

  it("file reads come from the edge cache after the first one", async () => {
    const { env, calls } = makeEnv();
    const { cache, entries } = makeCache();
    const cached = { ...env, cache };
    const { id } = await (await createShare(form(), cached, "https://z.test")).json();
    const first = await getShareFile(id, "picture.png", cached);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const second = await getShareFile(id, "picture.png", cached);
    expect(second.status).toBe(200);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(second.headers.get("content-type")).toBe("image/png");
    expect(second.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(second.headers.get("x-content-type-options")).toBe("nosniff");
    expect(calls.get).toBe(1);
  });

  it("a missing file is cached for a minute and not fetched again", async () => {
    const { env, calls } = makeEnv();
    const { cache, entries } = makeCache();
    const cached = { ...env, cache };
    expect((await getShareFile("AAAAAAAAAAAA", "drawing", cached)).status).toBe(404);
    expect((await getShareFile("AAAAAAAAAAAA", "drawing", cached)).status).toBe(404);
    expect(calls.get).toBe(1);
    expect(
      entries.get("https://zketch-share-cache/files/AAAAAAAAAAAA/drawing.zketch")?.headers.get("cache-control")
    ).toBe("public, max-age=60");
  });

  it("meta is cached for a minute, found or missing", async () => {
    const { env, calls } = makeEnv();
    const { cache, entries } = makeCache();
    const cached = { ...env, cache };
    const { id } = await (await createShare(form(), cached, "https://z.test")).json();
    const meta = await shareMeta(id, cached);
    expect(await shareMeta(id, cached)).toEqual(meta);
    expect(calls.head).toBe(1);
    expect(entries.get(`https://zketch-share-cache/meta/${id}`)?.headers.get("cache-control")).toBe(
      "public, max-age=60"
    );
    expect(await shareMeta("BBBBBBBBBBBB", cached)).toBeNull();
    expect(await shareMeta("BBBBBBBBBBBB", cached)).toBeNull();
    expect(calls.head).toBe(2);
    expect(entries.get("https://zketch-share-cache/meta/BBBBBBBBBBBB")?.headers.get("cache-control")).toBe(
      "public, max-age=60"
    );
  });

  it("unshare purges the cached files and meta", async () => {
    const { env } = makeEnv();
    const { cache, entries } = makeCache();
    const cached = { ...env, cache };
    const { id, deleteKey } = await (await createShare(form(), cached, "https://z.test")).json();
    await shareMeta(id, cached);
    for (const file of ["drawing", "picture.png", "preview.jpg"] as const) {
      await getShareFile(id, file, cached);
    }
    expect(entries.size).toBe(4);
    expect((await deleteShare(id, deleteKey, cached)).status).toBe(204);
    expect(entries.size).toBe(0);
    expect(await shareMeta(id, cached)).toBeNull();
  });

  it("background cache writes go through waitUntil", async () => {
    const { env } = makeEnv();
    const { cache, entries } = makeCache();
    const tasks: Promise<unknown>[] = [];
    const cached = { ...env, cache, waitUntil: (task: Promise<unknown>) => void tasks.push(task) };
    const { id } = await (await createShare(form(), cached, "https://z.test")).json();
    const res = await getShareFile(id, "preview.jpg", cached);
    expect(res.status).toBe(200);
    expect(tasks).toHaveLength(1);
    await Promise.all(tasks);
    expect(entries.size).toBe(1);
  });

  it("a failing cache never breaks reads", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { env } = makeEnv();
    const broken: CacheLike = {
      match: async () => {
        throw new Error("cache down");
      },
      put: async () => {
        throw new Error("cache down");
      },
      delete: async () => {
        throw new Error("cache down");
      },
    };
    const cached = { ...env, cache: broken };
    const { id, deleteKey } = await (await createShare(form(), cached, "https://z.test")).json();
    expect((await shareMeta(id, cached))?.name).toBe("My cat");
    expect((await getShareFile(id, "picture.png", cached)).status).toBe(200);
    expect((await deleteShare(id, deleteKey, cached)).status).toBe(204);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("accepts a gzipped drawing and serves it back as stored", async () => {
    const { env, objects } = makeEnv();
    const gz = await gzipShareText(DRAWING);
    const res = await createShare(form({ drawing: gz, drawingType: "application/gzip" }), env, "https://z.test");
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(objects.get(`shares/${id}/drawing.zketch`)!.httpMetadata.contentType).toBe("application/gzip");
    const file = await getShareFile(id, "drawing", env);
    expect(file.headers.get("content-type")).toBe("application/gzip");
    expect(await readShareText(file)).toBe(DRAWING);
  });

  it("rejects random bytes and mislabelled drawings", async () => {
    const { env } = makeEnv();
    const random = new Blob([new Uint8Array([7, 3, 9, 1, 0, 255, 12, 40])]);
    const gz = await gzipShareText(DRAWING);
    const cases = [
      form({ drawing: random, drawingType: "application/gzip" }),
      form({ drawing: random }),
      form({ drawing: gz }),
      form({ drawingType: "application/gzip" }),
    ];
    for (const f of cases) {
      expect((await createShare(f, env, "https://z.test")).status).toBe(400);
    }
  });

  describe("updateShare", () => {
    it("needs the right key and writes nothing otherwise", async () => {
      const { env, kvStore } = makeEnv();
      const { id } = await (await createShare(form(), env, "https://z.test")).json();
      expect((await updateShare(id, "wrong", { allowContinue: false }, env)).status).toBe(403);
      expect((await updateShare(id, "", { allowContinue: false }, env)).status).toBe(403);
      expect(kvStore.has(`share-continue:${id}`)).toBe(false);
      expect((await shareMeta(id, env))?.allowContinue).toBe(true);
    });

    it("switches can continue off and on and purges the cached meta", async () => {
      const { env, kvStore } = makeEnv();
      const { cache, entries } = makeCache();
      const cached = { ...env, cache };
      const { id, deleteKey } = await (await createShare(form(), cached, "https://z.test")).json();
      expect((await shareMeta(id, cached))?.allowContinue).toBe(true);
      const res = await updateShare(id, deleteKey, { allowContinue: false }, cached);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ allowContinue: false });
      expect(kvStore.get(`share-continue:${id}`)).toBe("0");
      expect(entries.has(`https://zketch-share-cache/meta/${id}`)).toBe(false);
      expect((await shareMeta(id, cached))?.allowContinue).toBe(false);
      expect((await updateShare(id, deleteKey, { allowContinue: true }, cached)).status).toBe(200);
      expect(kvStore.get(`share-continue:${id}`)).toBe("1");
      expect((await shareMeta(id, cached))?.allowContinue).toBe(true);
    });

    it("rejects a body without a boolean allowContinue", async () => {
      const { env, kvStore } = makeEnv();
      const { id, deleteKey } = await (await createShare(form(), env, "https://z.test")).json();
      for (const body of [null, {}, { allowContinue: "1" }, { allowContinue: 1 }, "x"]) {
        expect((await updateShare(id, deleteKey, body as never, env)).status).toBe(400);
      }
      expect(kvStore.size).toBe(0);
    });

    it("unknown or bad ids are 404", async () => {
      const { env } = makeEnv();
      expect((await updateShare("AAAAAAAAAAAA", "k", { allowContinue: true }, env)).status).toBe(404);
      expect((await updateShare("../x", "k", { allowContinue: true }, env)).status).toBe(404);
    });

    it("unshare removes the override", async () => {
      const { env, kvStore } = makeEnv();
      const { id, deleteKey } = await (await createShare(form(), env, "https://z.test")).json();
      await updateShare(id, deleteKey, { allowContinue: false }, env);
      expect(kvStore.has(`share-continue:${id}`)).toBe(true);
      expect((await deleteShare(id, deleteKey, env)).status).toBe(204);
      expect(kvStore.has(`share-continue:${id}`)).toBe(false);
    });

    it("unshare still works when the override can't be removed", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { env, objects } = makeEnv();
      const { id, deleteKey } = await (await createShare(form(), env, "https://z.test")).json();
      const kv: KVLike = {
        ...env.kv,
        delete: async () => {
          throw new Error("kv down");
        },
      };
      expect((await deleteShare(id, deleteKey, { ...env, kv })).status).toBe(204);
      expect(objects.size).toBe(0);
      errors.mockRestore();
    });

    it("meta falls back to the stored value when the override can't be read", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const { env } = makeEnv();
      const { id, deleteKey } = await (await createShare(form(), env, "https://z.test")).json();
      await updateShare(id, deleteKey, { allowContinue: false }, env);
      const kv: KVLike = {
        ...env.kv,
        get: async () => {
          throw new Error("kv down");
        },
      };
      expect((await shareMeta(id, { ...env, kv }))?.allowContinue).toBe(true);
      expect(errors).toHaveBeenCalled();
      errors.mockRestore();
    });
  });
});
