# Zketch

A drawing app that runs in the browser. Sketch, paint and diagram on an infinite canvas or a fixed-size page, keep everything in a local vault, and share a link that replays how the drawing was made.

Live at [zketch.zerro.dev](https://zketch.zerro.dev).

## Features

- 36 brushes: pen, marker, highlighter, airbrush, calligraphy, pencil, charcoal, pastel, watercolor, gouache, plus paint, texture, nature and effect brushes
- Stylus pressure, stabilizer, taper and per-brush settings that are remembered
- Shapes, arrows that stay attached to shapes, text, and hand-drawn looks for diagrams
- Layers, image import, selection with move, resize and rotate, undo and redo
- Infinite canvas or fixed-size pages
- Local vault: drawings are saved in your browser (IndexedDB) and never leave it unless you share them
- Backup files: save one drawing or the whole vault as a `.zketch` file and import it anywhere
- Export as PNG, JPG or SVG
- Timelapse replay of any layer, right in the editor
- Share links that replay the drawing, with picture and video download and embeds
- Three layouts (Bottom deck, Sidebars, Simple), dockable panels, light and dark themes
- Installs as an app and works offline
- Desktop first. Phones get the landing page and can watch shared drawings.

## Tech stack

- Astro 5 on Cloudflare Pages
- React 19
- MobX State Tree
- IndexedDB with Dexie
- Tailwind CSS 4, Radix UI and shadcn/ui
- Canvas 2D with Perfect Freehand
- Backblaze B2 for share links

## Getting started

```bash
git clone <repo-url>
cd zketch
npm install
npm run dev
```

Other commands:

```bash
npx tsc --noEmit   # type-check
npm test           # render tests (Vitest)
npm run build      # production build into dist/
```

Drawings are saved locally. Clearing the site data in your browser deletes them, so keep a `.zketch` backup of anything you care about.

## Docs

- [`architecture.md`](architecture.md): a map of the whole codebase. Read it before changing the engine, brushes, models or canvas interaction.
- [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md): sources and licences of the bundled brush assets.
- [`CLOUDFLARE_KV_SETUP.md`](CLOUDFLARE_KV_SETUP.md) and [`SHARING_MIGRATION.md`](SHARING_MIGRATION.md): setup for share links.
