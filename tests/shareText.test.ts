import { describe, it, expect } from "vitest";
import { gzipShareText, readShareText } from "../src/share/shareText";

const TEXT = '{"format":"zketch","version":1,"name":"Chat noir — été 🐈"}';

describe("share text", () => {
  it("gzips to bytes that start with the gzip magic", async () => {
    const gz = new Uint8Array(await (await gzipShareText(TEXT)).arrayBuffer());
    expect([gz[0], gz[1]]).toEqual([0x1f, 0x8b]);
  });

  it("reads a gzipped payload back", async () => {
    expect(await readShareText(new Response(await gzipShareText(TEXT)))).toBe(TEXT);
  });

  it("reads a plain payload as is", async () => {
    expect(await readShareText(new Response(TEXT))).toBe(TEXT);
  });

  it("throws once the decompressed output passes the cap", async () => {
    const gz = await gzipShareText("a".repeat(5000));
    expect(await readShareText(new Response(gz), 5000)).toBe("a".repeat(5000));
    await expect(readShareText(new Response(gz), 4999)).rejects.toThrow(/too large/);
  });
});
