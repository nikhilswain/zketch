import type { AstroIntegration } from "astro";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_CSS } from "../config";

const SHELL_PAGES: [url: string, file: string][] = [
  ["/draw", "draw/index.html"],
  ["/vault", "vault/index.html"],
];

const STATIC = [
  "/manifest.webmanifest",
  "/brand/zketch-icon-192.png",
  "/brand/zketch-icon-512.png",
  "/pwa/maskable-192.png",
  "/pwa/maskable-512.png",
  "/favicon.svg",
  "/favicon-96.png",
];

const ID_PAGE_SEEDS = [/^draw-by-id\./, /^_id_\.astro_astro_type_script/];
const REF = /(?:\/_astro\/|["'`]_astro\/|["'`]\.\/)([^"'`)\s?#]+\.\w+)/g;

function appAssets(out: string, html: string[], all: string[]): string[] {
  const astro = join(out, "_astro");
  const names = new Set(all.map((url) => url.slice("/_astro/".length)));
  const seeds = ID_PAGE_SEEDS.map((re) => [...names].filter((name) => re.test(name)));
  if (seeds.some((found) => !found.length)) {
    throw new Error(`zketch-service-worker: no build file matches ${ID_PAGE_SEEDS.find((_, i) => !seeds[i].length)} for /draw/[id]; update ID_PAGE_SEEDS`);
  }
  const queue = [...html.flatMap((text) => [...text.matchAll(REF)].map((m) => m[1])), ...seeds.flat()];
  const seen = new Set<string>();
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name) || !names.has(name)) continue;
    seen.add(name);
    if (name.endsWith(".js") || name.endsWith(".css")) {
      for (const m of readFileSync(join(astro, name), "utf8").matchAll(REF)) queue.push(m[1]);
    }
  }
  return all.filter((url) => seen.has(url.slice("/_astro/".length)));
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function serviceWorker(): AstroIntegration {
  let root = "";
  return {
    name: "zketch-service-worker",
    hooks: {
      "astro:config:done": ({ config }) => {
        root = fileURLToPath(config.root);
      },
      "astro:build:done": ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const toUrl = (file: string) => `/${relative(out, file).split(sep).join("/")}`;
        const pages = SHELL_PAGES.filter(([, file]) => existsSync(join(out, file)));
        const html = pages.map(([, file]) => readFileSync(join(out, file), "utf8"));
        const assets = appAssets(out, html, walk(join(out, "_astro")).map(toUrl).sort());
        const statics = STATIC.filter((url) => existsSync(join(out, url)));
        const precache = [...pages.map(([url]) => url), ...statics, ...assets];

        const brushes = walk(join(out, "brushes")).map(toUrl).sort();

        const template = readFileSync(join(root, "src/pwa/sw.js"), "utf8");
        const hash = createHash("sha256").update(template).update(precache.join("\n")).update(brushes.join("\n"));
        for (const [, file] of pages) hash.update(readFileSync(join(out, file)));
        for (const file of walk(join(out, "_worker.js")).sort()) hash.update(readFileSync(file));
        for (const url of statics) hash.update(readFileSync(join(out, url)));
        const version = hash.digest("hex").slice(0, 12);

        writeFileSync(
          join(out, "sw.js"),
          template
            .replace("__VERSION__", () => version)
            .replace("__PRECACHE__", () => JSON.stringify(precache))
            .replace("__BRUSH_FILES__", () => JSON.stringify(brushes))
            .replace("__FONT_CSS__", () => JSON.stringify(FONT_CSS)),
        );

        logger.info(`sw.js ${version}: ${precache.length} files precached`);
      },
    },
  };
}
