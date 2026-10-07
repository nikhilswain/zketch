import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { parseGbr, parseGih, type GimpBrush } from "../src/engine/brush-formats/gimp.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".brush-cache");
const OUT = join(ROOT, "public", "brushes");
const MAX_TIP = 256;
const GRAIN_SIZE = 512;
const RETRIEVED = "2026-10-07";

interface TipJob {
  id: string;
  file: string;
}

interface GrainJob {
  id: string;
  file: string;
}

interface Source {
  dir: string;
  title: string;
  author: string;
  url: string;
  page: string;
  sha256: string;
  license: string;
  licenseText: string;
  innerZip?: string;
  tips: TipJob[];
  grains: GrainJob[];
}

const SOURCES: Source[] = [
  {
    dir: "revoy-2025-01",
    title: "Krita brushes 2025-01 bundle",
    author: "David Revoy",
    url: "https://www.peppercarrot.com/extras/resources/deevad-bundle_25.01.zip",
    page: "https://www.davidrevoy.com/article1060/krita-brushes-2025-01-bundle/show",
    sha256: "4c628a9418fcde63abacafdcb143881f2cbbf907275cb4f72335545841cf8173",
    license: "CC0-1.0",
    licenseText:
      "These brushes are licensed under CC-0 Public domain. You are free to do commercial work with them, to reshare them, to modify them and to include them in your software.\n(David Revoy, https://www.davidrevoy.com/article1060/krita-brushes-2025-01-bundle/show; bundle meta.xml license: CC-0)\n\nCreative Commons CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/\n",
    innerZip: "Deevad_25.01.bundle",
    tips: [
      { id: "chalk", file: "brushes/chalk.png" },
      { id: "chalk-sparse", file: "brushes/chalk_sparse.png" },
      { id: "charcoal", file: "brushes/chalk_chisel_random.gih" },
      { id: "splat", file: "brushes/splats_large.gih" },
      { id: "splat-dots", file: "brushes/splat_dots.png" },
      { id: "painterly", file: "brushes/deevad-painterly-brush-tip_2023C.png" },
      { id: "flat-dirty", file: "brushes/flat-tip-dirty.png" },
      { id: "bristles", file: "brushes/bristles_grouped.gbr" },
      { id: "scratches", file: "brushes/scratches_rough.gih" },
      { id: "sponge", file: "brushes/rock_pitted-fixed.gih" },
    ],
    grains: [{ id: "paper-grain-b", file: "patterns/2022-04_paper-grain_B.png" }],
  },
];

async function download(source: Source) {
  mkdirSync(CACHE, { recursive: true });
  const target = join(CACHE, source.url.split("/").pop()!);
  if (!existsSync(target)) {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${source.url}`);
    writeFileSync(target, new Uint8Array(await res.arrayBuffer()));
  }
  const data = new Uint8Array(readFileSync(target));
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== source.sha256) {
    throw new Error(`sha256 mismatch for ${source.url}: ${hash}`);
  }
  return data;
}

function extract(source: Source, archive: Uint8Array) {
  let files = unzipSync(archive);
  if (source.innerZip) {
    const inner = files[source.innerZip];
    if (!inner) throw new Error(`Missing ${source.innerZip}`);
    files = unzipSync(inner);
  }
  return files;
}

function fit(width: number, height: number, max: number) {
  const k = Math.min(1, max / Math.max(width, height));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

function maskFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    const lum = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
    alpha[i] = rgba[o + 3] * (1 - lum);
  }
  const sorted = alpha.filter((v) => v > 0).sort();
  const peak = sorted.length ? sorted[Math.floor(sorted.length * 0.995)] : 255;
  const gain = Math.min(4, 255 / Math.max(1, peak));
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    image.data[o] = 255;
    image.data[o + 1] = 255;
    image.data[o + 2] = 255;
    image.data[o + 3] = Math.min(255, Math.round(alpha[i] * gain));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function maskFromGimp(brush: GimpBrush) {
  if (brush.bytesPerPixel === 4) {
    return maskFromRgba(brush.pixels, brush.width, brush.height);
  }
  const rgba = new Uint8Array(brush.width * brush.height * 4);
  for (let i = 0; i < brush.width * brush.height; i++) {
    rgba[i * 4 + 3] = brush.pixels[i];
  }
  return maskFromRgba(rgba, brush.width, brush.height);
}

async function maskFromPng(data: Uint8Array) {
  const img = await loadImage(Buffer.from(data));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return maskFromRgba(ctx.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
}

function resize(canvas: Canvas, max: number) {
  const [w, h] = fit(canvas.width, canvas.height, max);
  if (w === canvas.width && h === canvas.height) return canvas;
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

async function grainFromPng(data: Uint8Array) {
  const img = await loadImage(Buffer.from(data));
  const size = Math.min(GRAIN_SIZE, img.width, img.height);
  const src = createCanvas(img.width, img.height);
  const sctx = src.getContext("2d");
  sctx.drawImage(img, 0, 0);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, img.width, img.height, 0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  let min = 255;
  let max = 0;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < lum.length; i++) {
    const o = i * 4;
    const v = 0.2126 * image.data[o] + 0.7152 * image.data[o + 1] + 0.0722 * image.data[o + 2];
    lum[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < lum.length; i++) {
    const v = Math.round(((lum[i] - min) / range) * 255);
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function sha(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const manifest = {
    version: 1,
    sources: {} as Record<string, unknown>,
    tips: {} as Record<string, { files: string[]; source: string; upstream: string }>,
    grains: {} as Record<string, { file: string; size: number; source: string; upstream: string }>,
  };

  for (const source of SOURCES) {
    const files = extract(source, await download(source));
    const dir = join(OUT, source.dir);
    mkdirSync(dir, { recursive: true });

    for (const tip of source.tips) {
      const data = files[tip.file];
      if (!data) throw new Error(`Missing ${tip.file} in ${source.url}`);
      let frames: Canvas[];
      if (tip.file.endsWith(".gih")) {
        frames = parseGih(data).frames.map(maskFromGimp);
      } else if (tip.file.endsWith(".gbr")) {
        frames = [maskFromGimp(parseGbr(data))];
      } else {
        frames = [await maskFromPng(data)];
      }
      const names: string[] = [];
      frames.forEach((frame, i) => {
        const name = frames.length === 1 ? `${tip.id}.png` : `${tip.id}-${i}.png`;
        writeFileSync(join(dir, name), resize(frame, MAX_TIP).toBuffer("image/png"));
        names.push(`${source.dir}/${name}`);
      });
      manifest.tips[`${source.dir}/${tip.id}`] = {
        files: names,
        source: source.dir,
        upstream: tip.file,
      };
    }

    for (const grain of source.grains) {
      const data = files[grain.file];
      if (!data) throw new Error(`Missing ${grain.file} in ${source.url}`);
      const canvas = await grainFromPng(data);
      const name = `${grain.id}.png`;
      writeFileSync(join(dir, name), canvas.toBuffer("image/png"));
      manifest.grains[`${source.dir}/${grain.id}`] = {
        file: `${source.dir}/${name}`,
        size: canvas.width,
        source: source.dir,
        upstream: grain.file,
      };
    }

    writeFileSync(join(dir, "LICENSE.txt"), source.licenseText);
    writeFileSync(
      join(dir, "README.md"),
      [
        `# ${source.title}`,
        "",
        `- Author: ${source.author}`,
        `- Source: ${source.url}`,
        `- Page: ${source.page}`,
        `- License: ${source.license}`,
        `- Archive sha256: ${source.sha256}`,
        `- Retrieved: ${RETRIEVED}`,
        "- Modifications: brush tips converted to white-on-alpha PNG masks (alpha = original alpha x darkness, levels stretched so the 99.5th percentile is opaque), downscaled to at most 256 px; GIMP .gih pipes split into numbered frames; grain patterns converted to normalized grayscale.",
        "",
      ].join("\n"),
    );
    manifest.sources[source.dir] = {
      title: source.title,
      author: source.author,
      url: source.url,
      page: source.page,
      license: source.license,
      sha256: source.sha256,
      retrieved: RETRIEVED,
    };
  }

  const json = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(join(OUT, "manifest.json"), json);
  console.log(
    `Wrote ${Object.keys(manifest.tips).length} tips, ${Object.keys(manifest.grains).length} grains (manifest sha256 ${sha(new TextEncoder().encode(json)).slice(0, 12)})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
