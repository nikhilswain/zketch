import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const DIST = join(__dirname, "..", "dist");
const home = join(DIST, "index.html");
const built = existsSync(home);

function scriptGraph(html: string): string[] {
  const seen = new Set<string>();
  const queue = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const m of html.matchAll(/import\("?(\/_astro\/[^")]+\.js)"?\)/g)) queue.push(m[1]);
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    for (const i of m[1].matchAll(/(?:import|from)\s*["'](\/_astro\/[^"']+\.js)["']/g)) queue.push(i[1]);
  }
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const code = readFileSync(join(DIST, path), "utf8");
    for (const m of code.matchAll(/(?:import|from)\s*["'](\.\/[^"']+\.js)["']/g)) queue.push(`/_astro/${m[1].slice(2)}`);
  }
  return [...seen];
}

describe.skipIf(!built)("built landing page", () => {
  const html = built ? readFileSync(home, "utf8") : "";

  it("serves real copy in the static HTML", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("right in your browser");
    expect(html).toContain('href="/draw"');
    for (const heading of ["sketchy diagrams that keep up", "real textures, not just lines", "layers, like a grown-up app", "watch it draw itself", "send it anywhere", "your drawings never leave your browser"]) {
      expect(html).toContain(heading);
    }
    expect(html).not.toContain("astro-island");
    expect(html).toContain('"@type":"WebApplication"');
  });

  it("keeps the JavaScript that loads with the page under 150 KB gzip", () => {
    const files = scriptGraph(html);
    expect(files.length).toBeGreaterThan(0);
    const gz = files.reduce((n, f) => n + gzipSync(readFileSync(join(DIST, f))).length, 0);
    console.log(`landing js: ${files.length} files, ${(gz / 1024).toFixed(1)} KB gzip`);
    expect(gz).toBeLessThan(150 * 1024);
  });

  it("leaves the vault out of the sitemap", () => {
    const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
    expect(sitemap).toMatch(/<loc>https:\/\/zketch\.zerro\.dev\/?<\/loc>/);
    expect(sitemap).not.toContain("/vault");
  });
});
