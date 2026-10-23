const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const FONT_CSS = __FONT_CSS__;
const SHELL = `zketch-shell-${VERSION}`;
const PAGES = "zketch-pages";
const ASSETS = "zketch-assets";
const BRUSHES = "zketch-brushes";
const FONTS = "zketch-fonts";
const DRAW_SHELL = "/draw/__shell";
const NAV_TIMEOUT = 3000;
const BYPASS = [/^\/api\//, /^\/share(\/|$|\.)/, /^\/embed\//];
const APP_PATHS = [/^\/vault\/?$/, /^\/draw(\/|$)/];

const clean = async (res) => {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
};

async function fill(cache, url, key = url) {
  const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(key, await clean(res));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(PRECACHE.map((url) => fill(cache, url)));
      await fill(cache, DRAW_SHELL);
      await warmFonts();
    })(),
  );
});

async function warmFonts() {
  try {
    const cache = await caches.open(FONTS);
    const res = await fetch(FONT_CSS, { mode: "cors" });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(
      files.map(async (url) => {
        if (await cache.match(url)) return;
        const font = await fetch(url, { mode: "cors" });
        if (font.ok) await cache.put(url, font);
      }),
    );
  } catch {}
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("zketch-shell-") && k !== SHELL).map((k) => caches.delete(k)));
      await caches.delete(PAGES);
      await self.clients.claim();
    })(),
  );
});

async function warmBrushes() {
  try {
    const res = await fetch("/brushes/manifest.json");
    if (!res.ok) return;
    const manifest = await res.json();
    const files = new Set();
    for (const tip of Object.values(manifest.tips ?? {})) for (const f of tip.files ?? []) files.add(`/brushes/${f}`);
    for (const grain of Object.values(manifest.grains ?? {})) for (const f of grain.files ?? []) files.add(`/brushes/${f}`);
    const cache = await caches.open(BRUSHES);
    for (const url of files) {
      if (await cache.match(url)) continue;
      try {
        await fill(cache, url);
      } catch {}
    }
  } catch {}
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "WARM_BRUSHES") event.waitUntil(warmBrushes());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function fromCaches(...keys) {
  for (const key of keys) {
    const hit = await caches.match(key, { ignoreSearch: true });
    if (hit) return hit;
  }
  return undefined;
}

async function navigate(request, path) {
  const app = APP_PATHS.some((re) => re.test(path));
  try {
    const res = await Promise.race([fetch(request), timeout(NAV_TIMEOUT)]);
    if (res.ok && app && !res.redirected) {
      const cache = await caches.open(PAGES);
      await cache.put(path.startsWith("/draw/") ? DRAW_SHELL : path, res.clone());
    }
    return res;
  } catch (error) {
    const keys = path.startsWith("/draw/") ? [DRAW_SHELL] : [path, path.replace(/\/$/, "") || "/"];
    const hit = await fromCaches(...keys, ...(app ? ["/vault"] : []));
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(request, name) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(name);
    await cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request, name, event) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then(async (res) => {
      if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === "https://fonts.googleapis.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS, event));
    return;
  }
  if (url.origin === "https://fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  if (BYPASS.some((re) => re.test(path)) || path === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request, path));
    return;
  }
  if (path.startsWith("/_astro/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (path.startsWith("/brushes/")) {
    event.respondWith(staleWhileRevalidate(request, BRUSHES, event));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, ASSETS, event));
});
