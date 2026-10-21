import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShareLink,
  findReusable,
  forgetShare,
  listAllShares,
  listShares,
  rememberShare,
  setShareContinue,
  shareHash,
  unshareLinks,
  type SharedLink,
} from "@/share/shareClient";
import type { ISavedDrawingData } from "@/models/VaultModel";

const KEY = "zketch-shares-v1";
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
});

const link = (id: string, drawingId: string | null, createdAt: number): SharedLink => ({
  id,
  url: `https://zketch.example/s/${id}`,
  deleteKey: `key-${id}`,
  drawingId,
  createdAt,
  allowContinue: false,
});

describe("share registry", () => {
  it("remembers links per drawing, newest first", () => {
    rememberShare(link("a", "d1", 1));
    rememberShare(link("b", "d2", 2));
    rememberShare(link("c", "d1", 3));
    expect(listShares("d1").map((l) => l.id)).toEqual(["c", "a"]);
    expect(listShares("d2").map((l) => l.id)).toEqual(["b"]);
  });

  it("forget removes one", () => {
    rememberShare(link("a", "d1", 1));
    rememberShare(link("c", "d1", 3));
    forgetShare("a");
    expect(listShares("d1").map((l) => l.id)).toEqual(["c"]);
  });

  it("bad stored JSON reads as empty", () => {
    store.set(KEY, "{not json");
    expect(listShares("d1")).toEqual([]);
    store.set(KEY, JSON.stringify({ nope: true }));
    expect(listShares("d1")).toEqual([]);
  });
});

const drawing = (overrides: Partial<ISavedDrawingData> = {}): ISavedDrawingData => ({
  id: "d1",
  name: "Cat",
  layers: [
    { id: "l1", type: "draw", name: "Layer 1", visible: true, locked: false, opacity: 1, elements: [] },
  ] as unknown as ISavedDrawingData["layers"],
  activeLayerId: "l1",
  thumbnail: "",
  createdAt: new Date(1),
  updatedAt: new Date(1),
  background: "plain",
  ...overrides,
});

describe("share reuse", () => {
  it("hash ignores ids and timestamps but not content", async () => {
    const base = await shareHash(drawing());
    expect(await shareHash(drawing({ id: "other", updatedAt: new Date(99), thumbnail: "x" }))).toBe(base);
    expect(await shareHash(drawing({ name: "Dog" }))).not.toBe(base);
    expect(await shareHash(drawing({ background: "grid" }))).not.toBe(base);
    const changed = drawing();
    (changed.layers[0] as { opacity: number }).opacity = 0.5;
    expect(await shareHash(changed)).not.toBe(base);
  });

  it("finds a link only for the same hash and continue setting", () => {
    rememberShare({ ...link("a", "d1", 1), contentHash: "h", allowContinue: true });
    rememberShare({ ...link("old", "d1", 0) });
    expect(findReusable("d1", "h", true)?.id).toBe("a");
    expect(findReusable("d1", "h", false)).toBeUndefined();
    expect(findReusable("d1", "other", true)).toBeUndefined();
    expect(findReusable("d2", "h", true)).toBeUndefined();
    expect(findReusable(null, "h", true)).toBeUndefined();
  });

  it("createShareLink returns the existing link without uploading", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const d = drawing();
      rememberShare({ ...link("a", "d1", 1), contentHash: await shareHash(d), allowContinue: true });
      const result = await createShareLink({ drawing: d, allowContinue: true, drawingId: "d1" });
      expect(result.reused).toBe(true);
      expect(result.link.id).toBe("a");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("all links", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every link newest first, old entries without a name included", () => {
    store.set(KEY, JSON.stringify([link("a", "d1", 1), link("b", null, 5)]));
    rememberShare({ ...link("c", "d2", 3), name: "Cat" });
    const all = listAllShares();
    expect(all.map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(all[1].name).toBe("Cat");
    expect(all[0].name).toBeUndefined();
  });

  it("setShareContinue saves the new setting", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ allowContinue: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    rememberShare({ ...link("a", "d1", 1), contentHash: "h" });
    const updated = await setShareContinue(listAllShares()[0], true);
    expect(updated.allowContinue).toBe(true);
    expect(listAllShares()[0].allowContinue).toBe(true);
    expect(findReusable("d1", "h", true)?.id).toBe("a");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shares/a");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-delete-key"]).toBe("key-a");
    expect(JSON.parse(init.body as string)).toEqual({ allowContinue: true });
  });

  it("setShareContinue forgets a link that is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
    rememberShare(link("a", "d1", 1));
    await expect(setShareContinue(link("a", "d1", 1), true)).rejects.toThrow("gone");
    expect(listAllShares()).toEqual([]);
  });

  it("setShareContinue keeps the link on other failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    rememberShare(link("a", "d1", 1));
    await expect(setShareContinue(link("a", "d1", 1), true)).rejects.toThrow();
    expect(listAllShares()[0].allowContinue).toBe(false);
  });

  it("unshareLinks counts removed and failed links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => new Response(null, { status: url.endsWith("/b") ? 500 : 204 }))
    );
    for (const [i, id] of ["a", "b", "c", "d"].entries()) rememberShare(link(id, "d1", i));
    const result = await unshareLinks(listAllShares());
    expect(result).toEqual({ removed: 3, failed: 1 });
    expect(listAllShares().map((l) => l.id)).toEqual(["b"]);
  });
});
