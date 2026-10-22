import { describe, expect, it } from "vitest";
import { oembed } from "../src/share/oembed";
import type { ShareMeta } from "../src/share/shareServer";

const origin = "https://zketch.zerro.dev";
const id = "aB3dE5fG7hJ9";
const meta: ShareMeta = {
  id,
  name: "Cosy house",
  createdAt: 1,
  allowContinue: false,
  previewWidth: 1200,
  previewHeight: 900,
};

const lookup = async (key: string) => (key === id ? meta : null);

function query(params: Record<string, string>) {
  return new URLSearchParams(params);
}

describe("oembed", () => {
  it("describes a share link", async () => {
    const res = await oembed(query({ url: `${origin}/share/${id}`, format: "json" }), origin, lookup);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toMatchObject({
      type: "rich",
      version: "1.0",
      title: "Cosy house",
      provider_name: "zketch",
      provider_url: origin,
      width: 640,
      height: 504,
      thumbnail_url: `${origin}/api/shares/${id}/preview.jpg`,
      thumbnail_width: 1200,
      thumbnail_height: 900,
    });
    expect(body.html).toContain(`src="${origin}/embed/${id}"`);
  });

  it("accepts embed urls with a query", async () => {
    const res = await oembed(query({ url: `${origin}/embed/${id}?mode=auto&loop=1` }), origin, lookup);
    expect(res.status).toBe(200);
  });

  it("scales to maxwidth and maxheight", async () => {
    const narrow = await (await oembed(query({ url: `${origin}/share/${id}`, maxwidth: "320" }), origin, lookup)).json();
    expect([narrow.width, narrow.height]).toEqual([320, 264]);
    const short = await (await oembed(query({ url: `${origin}/share/${id}`, maxheight: "264" }), origin, lookup)).json();
    expect([short.width, short.height]).toEqual([320, 264]);
  });

  it("rejects other sites, bad ids and unknown shares", async () => {
    const bad = [
      `https://evil.example/share/${id}`,
      `${origin}/share/short`,
      `${origin}/draw/${id}`,
      `${origin}/share/ZZZZZZZZZZZZ`,
      "not a url",
    ];
    for (const url of bad) {
      expect((await oembed(query({ url }), origin, lookup)).status).toBe(404);
    }
    expect((await oembed(query({}), origin, lookup)).status).toBe(404);
  });

  it("never exceeds maxheight", async () => {
    for (const maxheight of ["25", "100", "263", "300"]) {
      const res = await oembed(query({ url: `${origin}/share/${id}`, maxheight }), origin, lookup);
      const body = await res.json();
      expect(body.height).toBeLessThanOrEqual(Number(maxheight));
      expect(body.width).toBeGreaterThan(0);
    }
    const tiny = await oembed(query({ url: `${origin}/share/${id}`, maxheight: "24" }), origin, lookup);
    expect(tiny.status).toBe(404);
  });

  it("is a 404 when the lookup fails", async () => {
    const failing = async () => {
      throw new Error("storage down");
    };
    const res = await oembed(query({ url: `${origin}/share/${id}` }), origin, failing);
    expect(res.status).toBe(404);
  });

  it("leaves out an unknown thumbnail size", async () => {
    const unsized = async () => ({ ...meta, previewWidth: 0, previewHeight: 0 });
    const body = await (await oembed(query({ url: `${origin}/share/${id}` }), origin, unsized)).json();
    expect(body.thumbnail_url).toBeDefined();
    expect(body).not.toHaveProperty("thumbnail_width");
    expect(body).not.toHaveProperty("thumbnail_height");
  });

  it("does not do xml", async () => {
    const res = await oembed(query({ url: `${origin}/share/${id}`, format: "xml" }), origin, lookup);
    expect(res.status).toBe(501);
  });
});
