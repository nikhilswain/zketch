import { describe, it, expect } from "vitest";
import {
  createShare,
  shareMeta,
  getShareFile,
  deleteShare,
  type R2Like,
  type KVLike,
  type ShareEnv,
} from "../src/share/shareServer";

function makeEnv() {
  const objects = new Map<
    string,
    { data: Blob; httpMetadata?: any; customMetadata?: Record<string, string> }
  >();
  const kvStore = new Map<string, string>();
  const bucket: R2Like = {
    async put(key, body, opts) {
      objects.set(key, {
        data: await new Response(body as any).blob(),
        httpMetadata: opts?.httpMetadata,
        customMetadata: opts?.customMetadata,
      });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        body: o.data.stream(),
        httpMetadata: o.httpMetadata,
        customMetadata: o.customMetadata,
      };
    },
    async head(key) {
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
  };
  const env: ShareEnv = { bucket, kv };
  return { env, objects };
}

const DRAWING = '{"format":"zketch","version":1,"layers":[]}';

function form(over: { drawing?: Blob } = {}) {
  const f = new FormData();
  f.set(
    "drawing",
    new File([over.drawing ?? DRAWING], "d.zketch", { type: "application/json" })
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
    const res = await createShare(form(), "1.1.1.1", env, "https://z.test");
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
    const res = await createShare(form({ drawing: new Blob(['{"hello":1}']) }), "1.1.1.1", env, "https://z.test");
    expect(res.status).toBe(400);
  });

  it("rejects oversized drawing", async () => {
    const { env } = makeEnv();
    const big = new Blob([DRAWING, new Uint8Array(10 * 1024 * 1024 + 1 - DRAWING.length)]);
    const res = await createShare(form({ drawing: big }), "1.1.1.1", env, "https://z.test");
    expect(res.status).toBe(413);
  });

  it("rate limits after 20 shares an hour", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < 20; i++) {
      const r = await createShare(form(), "2.2.2.2", env, "https://z.test");
      expect(r.status).toBe(201);
    }
    const res = await createShare(form(), "2.2.2.2", env, "https://z.test");
    expect(res.status).toBe(429);
  });

  it("meta and files come back", async () => {
    const { env } = makeEnv();
    const { id } = await (await createShare(form(), "1.1.1.1", env, "https://z.test")).json();
    const meta = await shareMeta(id, env);
    expect(meta?.name).toBe("My cat");
    expect(meta?.allowContinue).toBe(true);
    expect(meta?.previewWidth).toBe(800);
    const res = await getShareFile(id, "preview.jpg", env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("delete needs the right key", async () => {
    const { env, objects } = makeEnv();
    const { id, deleteKey } = await (await createShare(form(), "1.1.1.1", env, "https://z.test")).json();
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
});
