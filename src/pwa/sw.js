const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const BRUSH_FILES = __BRUSH_FILES__;
const FONT_CSS = __FONT_CSS__;
const SHELL = `zketch-shell-${VERSION}`;
const ASSETS = "zketch-assets";
const BRUSHES = "zketch-brushes";
const FONTS = "zketch-fonts";
const DRAW_SHELL = "/draw/__shell";
const NAV_TIMEOUT = 3000;
const BYPASS = [/^\/api\//, /^\/share(\/|$|\.)/, /^\/embed\//];
const DRAWING = /^\/draw\/[^/]+\/?$/;
const APP = [/^\/vault\/?$/, /^\/draw\/?$/, DRAWING];

const clean = async (res) => {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
};

async function fill(cache, url, key = url) {
  const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(key, await clean(res));
}

function store(event, name, request, res) {
  if (request.headers.has("range") || res.status === 206) return;
  event.waitUntil(
    caches
      .open(name)
      .then((cache) => cache.put(request, res))
      .catch(() => undefined),
  );
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

async function warmFonts() {
  const cache = await caches.open(FONTS);
  const res = await fetch(FONT_CSS, { mode: "cors", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return;
  const css = await res.clone().text();
  await cache.put(FONT_CSS, res);
  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  await Promise.all(
    files.map(async (url) => {
      if (await cache.match(url)) return;
      const font = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(8000) });
      if (font.ok) await cache.put(url, font);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all([...PRECACHE.map((url) => fill(cache, url)), fill(cache, DRAW_SHELL)]);
      await withTimeout(warmFonts().catch(() => undefined), 10000);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith("zketch-shell-") && k !== SHELL) || k === ASSETS || k === "zketch-pages")
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function warmBrushes() {
  const cache = await caches.open(BRUSHES);
  for (const url of BRUSH_FILES) {
    if (await cache.match(url)) continue;
    try {
      await fill(cache, url);
    } catch {}
  }
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "WARM_BRUSHES") event.waitUntil(warmBrushes());
});

function shellKey(path) {
  if (DRAWING.test(path)) return DRAW_SHELL;
  return path.replace(/\/$/, "") || "/";
}

async function navigate(request, path) {
  const app = APP.some((re) => re.test(path));
  const cached = () => (app ? caches.match(shellKey(path), { ignoreSearch: true }) : Promise.resolve(undefined));
  const net = fetch(request);
  try {
    const res = await withTimeout(net, NAV_TIMEOUT);
    if (!res) return (await cached()) ?? (await net);
    if (res.status >= 500 && app) return (await cached()) ?? res;
    return res;
  } catch (error) {
    const hit = await cached();
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(event, request, name) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) store(event, name, request, res.clone());
  return res;
}

async function staleWhileRevalidate(event, request, name) {
  const hit = await caches.match(request);
  const update = fetch(request).then(
    (res) => {
      if (res.ok) store(event, name, request, res.clone());
      return res;
    },
    () => undefined,
  );
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);

  if (request.url === FONT_CSS) {
    event.respondWith(staleWhileRevalidate(event, request, FONTS));
    return;
  }
  if (url.origin === "https://fonts.gstatic.com" && url.pathname.startsWith("/s/")) {
    event.respondWith(cacheFirst(event, request, FONTS));
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
    event.respondWith(cacheFirst(event, request, ASSETS));
    return;
  }
  if (path.startsWith("/brushes/")) {
    event.respondWith(staleWhileRevalidate(event, request, BRUSHES));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, request, ASSETS));
});
