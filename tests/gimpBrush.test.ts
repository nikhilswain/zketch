import { describe, expect, it } from "vitest";
import { parseGbr, parseGih } from "@/engine/brush-formats/gimp";

function gbr(name: string, width: number, height: number, bytes: number, spacing: number, fill: (i: number) => number) {
  const nameBytes = new TextEncoder().encode(name + "\0");
  const headerSize = 28 + nameBytes.length;
  const out = new Uint8Array(headerSize + width * height * bytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, headerSize);
  view.setUint32(4, 2);
  view.setUint32(8, width);
  view.setUint32(12, height);
  view.setUint32(16, bytes);
  out.set(new TextEncoder().encode("GIMP"), 20);
  view.setUint32(24, spacing);
  out.set(nameBytes, 28);
  for (let i = 0; i < width * height * bytes; i++) out[headerSize + i] = fill(i);
  return out;
}

describe("GIMP brush parsing", () => {
  it("parses a grayscale .gbr", () => {
    const b = parseGbr(gbr("chalk", 3, 2, 1, 25, (i) => i * 40));
    expect(b.name).toBe("chalk");
    expect([b.width, b.height, b.bytesPerPixel, b.spacing]).toEqual([3, 2, 1, 25]);
    expect([...b.pixels]).toEqual([0, 40, 80, 120, 160, 200]);
  });

  it("parses an RGBA .gbr", () => {
    const b = parseGbr(gbr("color", 2, 1, 4, 10, (i) => i));
    expect(b.bytesPerPixel).toBe(4);
    expect([...b.pixels]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("parses a .gih pipe into its cells", () => {
    const a = gbr("a", 2, 2, 1, 50, () => 255);
    const c = gbr("b", 2, 2, 1, 50, () => 128);
    const head = new TextEncoder().encode("pipe\n2 ncells:2 cellwidth:2 cellheight:2 step:100 dim:1 cols:1 rows:1 placement:constant rank0:2 sel0:random\n");
    const file = new Uint8Array(head.length + a.length + c.length);
    file.set(head, 0);
    file.set(a, head.length);
    file.set(c, head.length + a.length);
    const pipe = parseGih(file);
    expect(pipe.name).toBe("pipe");
    expect(pipe.params.sel0).toBe("random");
    expect(pipe.frames).toHaveLength(2);
    expect([...pipe.frames[1].pixels]).toEqual([128, 128, 128, 128]);
  });

  it("rejects data that is not a GIMP brush", () => {
    expect(() => parseGbr(new Uint8Array(40))).toThrow();
  });
});
