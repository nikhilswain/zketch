import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hash, sampleIcon } from "./lib/geometry.mjs";
import { STYLE, iconSvg, spriteSvg, toPathData } from "./lib/svg.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const appOut = args.includes("--app") ? args[args.indexOf("--app") + 1] : null;
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const galleryAt = join(root, "gallery.html");
const GROUP_TITLES = { core: "Tools", canvas: "Canvas", ui: "Interface", common: "General", art: "Art" };
const order = Object.keys(GROUP_TITLES);
const rank = (f) => {
  const i = order.indexOf(f.replace(/\.mjs$/, ""));
  return i < 0 ? order.length : i;
};
const byGroup = (a, b) => rank(a) - rank(b) || byName(a, b);

const groups = [];
const defs = new Map();
for (const file of readdirSync(join(root, "defs")).filter((f) => f.endsWith(".mjs")).sort(byGroup)) {
  const mod = (await import(pathToFileURL(join(root, "defs", file)).href)).default;
  const group = file.replace(/\.mjs$/, "");
  const names = Object.keys(mod);
  for (const name of names) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`Bad icon name "${name}" in ${file}`);
    if (defs.has(name)) throw new Error(`Icon "${name}" defined twice`);
    defs.set(name, mod[name]);
  }
  groups.push([group, names]);
}

const paths = new Map(
  [...defs].map(([name, def]) => [name, sampleIcon(def, hash(name)).map(toPathData).join("")]),
);
const sorted = [...paths].sort(([a], [b]) => byName(a, b));

rmSync(join(root, "svg"), { recursive: true, force: true });
mkdirSync(join(root, "svg"));
for (const [name, d] of sorted) writeFileSync(join(root, "svg", `${name}.svg`), iconSvg(d));
writeFileSync(join(root, "sprite.svg"), spriteSvg(sorted));

const appNames = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const missing = appNames.filter((n) => !paths.has(n));
if (appOut && missing.length) {
  console.error(`app.json names icons without a definition: ${missing.join(", ")}`);
  process.exit(1);
}
const pascal = (name) => name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const app = `import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & { size?: number | string };

const icon = (d: string) => {
  const Icon = ({ size = 24, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="${STYLE.viewBox}"
      fill="${STYLE.fill}"
      stroke="${STYLE.stroke}"
      strokeWidth={${STYLE.strokeWidth}}
      strokeLinecap="${STYLE.strokeLinecap}"
      strokeLinejoin="${STYLE.strokeLinejoin}"
      aria-hidden={props["aria-label"] ? undefined : true}
      role={props["aria-label"] ? "img" : undefined}
      {...props}
    >
      <path d={d} />
    </svg>
  );
  return Icon;
};

${[...appNames].sort(byName).map((n) => `export const ${pascal(n)}Icon = icon("${paths.get(n)}");`).join("\n")}
`;
if (appOut) {
  mkdirSync(dirname(appOut), { recursive: true });
  writeFileSync(appOut, app);
}

{
  const svg = (d, px) => `<svg width="${px}" height="${px}" viewBox="${STYLE.viewBox}" fill="none" stroke="currentColor" stroke-width="${STYLE.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const cell = (name) => `<figure><div class="sizes">${[14, 18, 24, 56].map((px) => svg(paths.get(name), px)).join("")}</div><figcaption>${name}</figcaption></figure>`;
  const bar = appNames.filter((n) => paths.has(n)).slice(0, 14).map((n, i) => `<span class="tile${i === 1 ? " on" : ""}">${svg(paths.get(n), 18)}</span>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zketch icons</title><style>
body{margin:0;background:#0E0E10;color:#ECEBE7;font:13px/1.4 system-ui,sans-serif;padding:32px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#9C9A94;margin:32px 0 12px}
.bar{display:flex;gap:2px;padding:8px;background:#141416;border-radius:6px;width:max-content}
.tile{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:4px}.tile.on{background:#2A2A2F;color:#FF6B5B}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
figure{margin:0;background:#141416;border-radius:6px;padding:14px}
.sizes{display:flex;align-items:flex-end;gap:14px}
figcaption{margin-top:10px;color:#C4C2BC;font-size:12px}.app{color:#FF6B5B;font-size:10px;margin-left:4px}
</style></head><body><h1>Zketch icons</h1><p style="color:#9C9A94;margin:0">${paths.size} brush-drawn icons. Sizes 14 / 18 / 24 / 56 px.</p>
<h2>In a bar</h2><div class="bar">${bar}</div>
${groups.map(([g, names]) => `<h2>${GROUP_TITLES[g] ?? g}</h2><div class="grid">${names.map(cell).join("")}</div>`).join("\n")}
</body></html>`;
  writeFileSync(galleryAt, html);
}

console.log(`icons: ${paths.size} in pack${appOut ? `, ${appNames.length} written to ${appOut}` : ""}`);
