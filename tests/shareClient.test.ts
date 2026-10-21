import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetShare, listShares, rememberShare, type SharedLink } from "@/share/shareClient";

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
