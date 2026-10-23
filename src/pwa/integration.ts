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
        const assets = walk(join(out, "_astro")).map(toUrl).sort();
        const pages = SHELL_PAGES.filter(([, file]) => existsSync(join(out, file)));
        const statics = STATIC.filter((url) => existsSync(join(out, url)));
        const precache = [...pages.map(([url]) => url), ...statics, ...assets];

        const template = readFileSync(join(root, "src/pwa/sw.js"), "utf8");
        const hash = createHash("sha256").update(template).update(precache.join("\n"));
        for (const [, file] of pages) hash.update(readFileSync(join(out, file)));
        const version = hash.digest("hex").slice(0, 12);

        writeFileSync(
          join(out, "sw.js"),
          template
            .replace("__VERSION__", version)
            .replace("__PRECACHE__", JSON.stringify(precache))
            .replace("__FONT_CSS__", JSON.stringify(FONT_CSS)),
        );

        logger.info(`sw.js ${version}: ${precache.length} files precached`);
      },
    },
  };
}
