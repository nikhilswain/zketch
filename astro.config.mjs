// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

import sitemap from "@astrojs/sitemap";

import { serviceWorker } from "./src/pwa/integration.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://zketch.zerro.dev",

  // Enable server-side rendering
  output: "server",

  integrations: [
    react(),
    serviceWorker(),
    sitemap({
      filter: (page) =>
        /^https:\/\/zketch\.zerro\.dev\/(draw|flowchart-maker|excalidraw-alternative|brushes|drawing-timelapse)?\/?$/.test(page),
      serialize(item) {
        item.url = item.url.replace(/(.)\/$/, "$1");
        return item;
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: import.meta.env.PROD
        ? { "react-dom/server": "react-dom/server.edge" }
        : undefined,
    },
  },

  adapter: cloudflare({
    routes: { extend: { exclude: [{ pattern: "/sw.js" }] } },
  }),
});
