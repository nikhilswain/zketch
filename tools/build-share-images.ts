import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { OG_FONTS, ogDefault, ogPage } from "../src/lib/og.ts";
import { TOPICS } from "../src/landing/topics.ts";

const faviconSvg = readFileSync("public/favicon.svg", "utf8");
const faviconPng = (size: number) => new Resvg(faviconSvg, { fitTo: { mode: "width", value: size } }).render().asPng();

function faviconIco(sizes: number[]): Buffer {
  const pngs = sizes.map((s) => faviconPng(s));
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, k) => {
    const o = 6 + 16 * k;
    head.writeUInt8(sizes[k] % 256, o);
    head.writeUInt8(sizes[k] % 256, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs]);
}

mkdirSync("public/og", { recursive: true });
const png = (svg: string) => new Resvg(svg, { font: { fontFiles: OG_FONTS, loadSystemFonts: false, defaultFontFamily: "Kalam" } }).render().asPng();

writeFileSync("public/og/default.png", png(ogDefault()));
for (const topic of TOPICS) writeFileSync(`public/og/${topic.slug}.png`, png(ogPage(topic.og, topic.tape)));
writeFileSync("public/favicon.ico", faviconIco([16, 32, 48]));
writeFileSync("public/favicon-96.png", faviconPng(96));
