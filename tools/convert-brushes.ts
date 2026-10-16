import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { readAbr, type Abr } from "ag-psd/dist/abr.js";
import { parseGbr, parseGih, type GimpBrush } from "../src/engine/brush-formats/gimp.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".brush-cache");
const OUT = join(ROOT, "public", "brushes");
const MAX_TIP = 256;
const GRAIN_SIZE = 512;
const MODIFICATIONS =
  "brush tips converted to white-on-alpha PNG masks (alpha = original alpha x darkness, levels stretched so the 99.5th percentile is opaque), downscaled to at most 256 px; GIMP .gih pipes split into numbered frames; grain patterns converted to normalized grayscale.";

interface TipJob {
  id: string;
  file: string | string[];
  mode?: "alpha";
  max?: number;
}

interface GrainJob {
  id: string;
  file: string;
}

interface Source {
  dir: string;
  title: string;
  author: string;
  url?: string;
  file?: string;
  page: string;
  sha256: string;
  license: string;
  licenseText: string;
  retrieved: string;
  modifications?: string;
  innerZip?: string;
  tips: TipJob[];
  grains: GrainJob[];
}

interface Assets {
  tip(name: string, mode?: "alpha"): Promise<Canvas[]>;
  grain(name: string): Promise<Canvas>;
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
    retrieved: "2026-10-07",
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
  {
    dir: "oga-grunge",
    title: "~100 grunge brushstrokes and splatters set",
    author: "Dino0040",
    url: "https://opengameart.org/sites/default/files/grunge_brushes.zip",
    page: "https://opengameart.org/node/119417",
    sha256: "ce17c54ed6ca8b3ecfb92e46a68a46b1c0d52f77fcdae5bfa310fc3afc092d2a",
    license: "CC0-1.0",
    licenseText:
      "License: CC0 (OpenGameArt.org, https://opengameart.org/node/119417, submitted by Dino0040).\n\nCreative Commons CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/\n",
    retrieved: "2026-10-07",
    tips: [
      {
        id: "wash",
        mode: "alpha",
        file: [44, 45, 46, 47].map(
          (n) => `grunge_brushes/normal_opacity/brush0${n}.png`,
        ),
      },
      {
        id: "bloom",
        mode: "alpha",
        file: [79, 92, 95, 98].map(
          (n) => `grunge_brushes/normal_opacity/brush0${n}.png`,
        ),
      },
    ],
    grains: [],
  },
  {
    dir: "rav89-digital-painting",
    title: "Photoshop Brushes for digital painting",
    author: "RaV89 (https://www.deviantart.com/rav89)",
    file: "brushes_for_photoshop_by_rav89.abr",
    page: "https://myphotoshopbrushes.com/resources/3883/photoshop-brushes-for-digital-painting",
    sha256: "5cad4d7ba5cf6ce6cb35fad972df75fe887d5d925c43d9d4d40a6c4f90dc2f7d",
    license: "MyPhotoshopBrushes Free for Commercial Use",
    licenseText:
      "License: Free for Commercial Use (MyPhotoshopBrushes, https://myphotoshopbrushes.com/licenses#free-commercial).\n\nFree to download and use in both personal and commercial projects. No attribution is required, though a credit is always appreciated. You may not redistribute or resell the files themselves, as standalone downloads or as part of a competing resource library.\n\nThese tips are converted for use inside the Zketch brush engine only. The original .abr is not distributed with Zketch.\n",
    retrieved: "2026-10-17",
    modifications:
      "sampled tips extracted from the .abr preset of the same name and converted to white-on-alpha PNG masks (levels stretched so the 99.5th percentile is opaque), downscaled to at most 256-768 px; brush textures converted to normalized grayscale grain tiles. Photoshop stock tips and patterns bundled in the .abr are not used.",
    tips: [
      { id: "paint-blot", file: "Sampled Brush 1 1" },
      { id: "rake", file: "样本画笔 2 19" },
      { id: "smear", file: "Sampled Brush 3 57", max: 384 },
      { id: "flat-bristle", file: "Sampled Brush 5 1", max: 384 },
      { id: "knife", file: "TN-brush 2" },
      { id: "soft-flat", file: "Sampled Brush 8 13" },
      { id: "wet-flat", file: "Sampled Brush 1 517", max: 384 },
      { id: "wet-edge", file: "Big watercolor brush - 2(Multiply)" },
      { id: "dabs", file: "Sampled Brush 3 61" },
      { id: "streaks", file: "Sampled Brush 2 32" },
      { id: "scratch", file: "Sampled Brush 2 133", max: 512 },
      { id: "crayon", file: "Forme échantillonnée 4 14" },
      {
        id: "cloud",
        file: ["dsc_0168.jpg 2", "Sampled Brush 2 134", "Sampled Brush 1 3"],
        max: 384,
      },
      {
        id: "dust",
        file: ["M@_Scattered_Points", "Sampled Brush 9 23", "Sampled Brush 16 2"],
        max: 512,
      },
      { id: "star", file: "7-STAR 1" },
      { id: "stars", file: "stars", max: 512 },
      { id: "glint", file: ["highlights 1", "Sampled Brush 27 1"], max: 384 },
      {
        id: "foliage",
        file: ["Sampled Brush 6 2", "Sampled Brush 6 1", "Sampled Brush 3 52"],
        max: 512,
      },
      {
        id: "leaves",
        file: ["Sampled Brush 8 16", "Forme échantillonnée 60 1"],
        max: 512,
      },
      { id: "grass", file: "Sampled Brush 7 2", max: 768 },
      { id: "forest", file: "TREE-BRUSH.psd 2", max: 512 },
      { id: "bush", file: "Sampled Brush 12 6" },
      { id: "pine", file: "Sampled Brush 16 1", max: 512 },
      {
        id: "tree",
        file: [
          "Sampled Brush 2",
          "treebranches",
          "RichFinalBushtree",
          "Sampled Brush 4 12",
          "Sampled Brush 4 14",
        ],
        max: 512,
      },
    ],
    grains: [
      { id: "rough-paper", file: "tile_roughPaper.jpg" },
      { id: "skin", file: "skin6" },
      { id: "watercolor-paper", file: "WaterColor_02" },
      { id: "grunge", file: "图案 3" },
      { id: "grunge-b", file: "pattern.jpg" },
    ],
  },
];

async function download(source: Source) {
  mkdirSync(CACHE, { recursive: true });
  const name = source.file ?? source.url!.split("/").pop()!;
  const target = join(CACHE, name);
  if (!existsSync(target)) {
    if (!source.url) {
      throw new Error(
        `Missing ${target}. Download it from ${source.page} and place ${name} in .brush-cache/.`,
      );
    }
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${source.url}`);
    writeFileSync(target, new Uint8Array(await res.arrayBuffer()));
  }
  const data = new Uint8Array(readFileSync(target));
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== source.sha256) {
    throw new Error(`sha256 mismatch for ${name}: ${hash}`);
  }
  return data;
}

function zipAssets(source: Source, archive: Uint8Array): Assets {
  let files = unzipSync(archive);
  if (source.innerZip) {
    const inner = files[source.innerZip];
    if (!inner) throw new Error(`Missing ${source.innerZip}`);
    files = unzipSync(inner);
  }
  const read = (file: string) => {
    const data = files[file];
    if (!data) throw new Error(`Missing ${file} in ${source.url}`);
    return data;
  };
  return {
    async tip(file, mode) {
      const data = read(file);
      if (file.endsWith(".gih")) return parseGih(data).frames.map(maskFromGimp);
      if (file.endsWith(".gbr")) return [maskFromGimp(parseGbr(data))];
      return [await maskFromPng(data, mode)];
    },
    async grain(file) {
      const img = await loadImage(Buffer.from(read(file)));
      const canvas = createCanvas(img.width, img.height);
      canvas.getContext("2d").drawImage(img, 0, 0);
      return grainFromCanvas(canvas);
    },
  };
}

function abrAssets(source: Source, data: Uint8Array): Assets {
  const abr: Abr = readAbr(data);
  const samples = new Map(abr.samples.map((s) => [s.id, s]));
  return {
    async tip(name) {
      const brush = abr.brushes.find((b) => b.name === name);
      if (!brush || brush.shape.type !== "sampled") {
        throw new Error(`No sampled preset "${name}" in ${source.file}`);
      }
      const sample = samples.get(brush.shape.sampledData);
      if (!sample) throw new Error(`Missing sample for "${name}"`);
      const { w, h } = sample.bounds;
      const rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = sample.alpha[i];
      return [maskFromRgba(rgba, w, h, "alpha")];
    },
    async grain(name) {
      const pattern = abr.patterns.find((p) => p.name === name);
      if (!pattern) throw new Error(`No pattern "${name}" in ${source.file}`);
      const { w, h } = pattern.bounds;
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(w, h);
      image.data.set(pattern.data);
      ctx.putImageData(image, 0, 0);
      return grainFromCanvas(canvas);
    },
  };
}

async function loadAssets(source: Source) {
  const data = await download(source);
  return source.file?.endsWith(".abr")
    ? abrAssets(source, data)
    : zipAssets(source, data);
}

function fit(width: number, height: number, max: number) {
  const k = Math.min(1, max / Math.max(width, height));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

function maskFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  mode?: "alpha",
) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    const lum = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
    alpha[i] = mode === "alpha" ? rgba[o + 3] : rgba[o + 3] * (1 - lum);
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

async function maskFromPng(data: Uint8Array, mode?: "alpha") {
  const img = await loadImage(Buffer.from(data));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return maskFromRgba(
    ctx.getImageData(0, 0, img.width, img.height).data,
    img.width,
    img.height,
    mode,
  );
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

function grainFromCanvas(src: Canvas) {
  const size = Math.min(GRAIN_SIZE, src.width, src.height);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, size, size);
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
    const assets = await loadAssets(source);
    const dir = join(OUT, source.dir);
    mkdirSync(dir, { recursive: true });

    for (const tip of source.tips) {
      const frames: Canvas[] = [];
      for (const file of Array.isArray(tip.file) ? tip.file : [tip.file]) {
        frames.push(...(await assets.tip(file, tip.mode)));
      }
      const names: string[] = [];
      frames.forEach((frame, i) => {
        const name = frames.length === 1 ? `${tip.id}.png` : `${tip.id}-${i}.png`;
        writeFileSync(
          join(dir, name),
          resize(frame, tip.max ?? MAX_TIP).toBuffer("image/png"),
        );
        names.push(`${source.dir}/${name}`);
      });
      manifest.tips[`${source.dir}/${tip.id}`] = {
        files: names,
        source: source.dir,
        upstream: Array.isArray(tip.file) ? tip.file.join(", ") : tip.file,
      };
    }

    for (const grain of source.grains) {
      const canvas = await assets.grain(grain.file);
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
        `- Source: ${source.url ?? source.file}`,
        `- Page: ${source.page}`,
        `- License: ${source.license}`,
        `- ${source.url ? "Archive" : "File"} sha256: ${source.sha256}`,
        `- Retrieved: ${source.retrieved}`,
        `- Modifications: ${source.modifications ?? MODIFICATIONS}`,
        "",
      ].join("\n"),
    );
    manifest.sources[source.dir] = {
      title: source.title,
      author: source.author,
      url: source.url,
      file: source.file,
      page: source.page,
      license: source.license,
      sha256: source.sha256,
      retrieved: source.retrieved,
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
