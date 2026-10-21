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
});
