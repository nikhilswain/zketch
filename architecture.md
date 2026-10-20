# Zketch — Architecture & Agent Handoff

> One-stop map of the codebase. Read this before touching the engine, brushes,
> layers, models, or canvas interaction. Written for a fresh agent with zero
> prior context.

---

## 1. What this app is

**Zketch** is a browser-based drawing / sketching app (a "notes + doodle" tool).
It is desktop-first, saves everything locally (IndexedDB), and can publish a
raster snapshot to a short share link via Cloudflare KV.

Core capabilities:

- Freehand drawing with pressure sensitivity (Perfect Freehand).
- Brushes: **Pen/Ink**, **Marker**, **Highlighter**, **Airbrush**,
  **Calligraphy**, **Eraser**, plus stamp-engine media: **Pencil**, **Charcoal**,
  **Pastel**, **Watercolor**, **Gouache**, **Dry Brush**, **Sponge**, **Splatter**,
  and 23 brushes from RaV89's Photoshop pack (`engine/brushes/rav89Brushes.ts`):
  paint (Oil Paint, Bristle Rake, Flat Bristle, Palette Knife, Rough Smear, Soft
  Flat, Wet Flat), Wax Crayon, texture (Impressionist, Streaks, Scratchy, Dust),
  nature stamps (Clouds, Foliage, Leaves, Grass, Bush, Pine, Forest, Bare Tree)
  and effects (Sparkle, Starfield, Water Glints). The picker groups brushes by
  `Brush.category` (draw/paint/texture/nature/effects, `utils/brushCategories.ts`). `spray` and `texture` are **legacy** (`Brush.legacy`):
  still registered so old saves render, but hidden from the picker/shortcuts.
- Shape tools: rectangle, circle, diamond, triangle (drag-to-create; Shift =
  square aspect).
- Diagrams: arrows and lines that bind to shapes (bend, heads, labels), a text
  tool, labels inside shapes, and five looks (Clean, Sketchy, Pencil, Crayon,
  Charcoal). See §4.6.
- Multi-layer canvas (draw layers mix strokes, shapes, arrows and text; image
  layers hold imported rasters).
- Infinite or fixed-size pages per drawing (presets + custom, `utils/page.ts`).
- Selection / move / resize / rotate (single + multi-select, marquee, anchor bbox).
- Undo / redo, eraser (Whole / Pixels / Smart modes).
- Local vault (Dexie/IndexedDB), PNG/JPG export (SVG method kept but hidden),
  image import, share links.
- Per-layer **timelapse animation playback** (replays stroke timing with gap
  compression).

Slogan from README: *"A simple drawing app where you can sketch anything you want."*

---

## 2. Tech stack & commands

| Concern | Choice |
|---|---|
| Framework | **Astro 5** (`output: "server"`, `@astrojs/cloudflare` adapter) |
| UI | **React 19** islands (`client:only="react"`) |
| State | **MobX State Tree (MST) 7** |
| Persistence | **Dexie 4** (IndexedDB) |
| Styling | **Tailwind CSS 4** + shadcn/ui (new-york, zinc) + Radix primitives |
| Drawing | **perfect-freehand**, Canvas 2D |
| Icons | own brush-drawn set: `src/components/icons/` (generated from the `icons/` pack) |
| Hosting | Cloudflare Pages + KV (`ZKETCH_SHARES`) |
| Color picker | own `studio/HsvPicker.tsx` |

```bash
npm install
npm run dev        # astro dev
npm run build      # astro build  → dist/
npm run preview
npm test           # vitest run (engine/render tests)
# deploy: wrangler pages deploy dist --project-name zketch
```

No linter/formatter is configured. Type-check with `npx tsc --noEmit`.
`npm test` runs Vitest (Node) against `src/engine/render` using `@napi-rs/canvas`
as the canvas backend (`tests/`). Path alias `@/*` → `src/*` (see `tsconfig.json`
and `vitest.config.ts`).

---

## 3. Directory map

```
src/
├── engine/          # Framework-agnostic rendering + input + transform (NO React)
│   ├── CanvasEngine.ts        # Multi-canvas renderer: background / layers / overlay
│   ├── GridRenderer.ts        # World-space grid honoring pan/zoom
│   ├── TransformController.ts # bbox math, handles, hit-test, move/resize/rotate
│   ├── InputManager.ts        # Pointer/touch/stylus intent + gestures (pinch/pan)
│   ├── AnimationPlaybackEngine.ts # Timelapse playback + gap compression
│   ├── arrowHandles.ts        # Arrow end/middle handle positions + hit-test
│   ├── brushOptions.ts        # Builds per-brush BrushOptions from settings
│   ├── easing.ts             # Easing-name → fn resolver (shared by brushes + options)
│   ├── types.ts              # All engine contracts (StrokeLike, LayerLike, Brush…)
│   ├── index.ts              # Barrel exports
│   ├── render/               # Shared renderers + brush registry (canvas/export/thumb)
│   │   ├── BrushRegistry.ts   # Brush map + shared singleton + registerDefaultBrushes()
│   │   ├── renderDrawLayer.ts # One stacking order for a draw layer's elements
│   │   ├── renderStroke.ts    # Eraser-aware stroke renderer (composite-safe)
│   │   ├── renderShape.ts     # Shape renderer (applies element opacity/rotation)
│   │   ├── renderArrow.ts     # Arrow/line body, heads, label
│   │   ├── renderText.ts      # Free text + labels
│   │   ├── sketchy.ts         # Hand-drawn looks (Sketchy/Pencil/Crayon/Charcoal)
│   │   ├── shapePaths.ts      # ONE copy of rect/circle/diamond/triangle paths
│   │   ├── renderImage.ts     # Image layer draw with rotation
│   │   ├── lookup.ts          # id → element lookup for arrows and labels
│   │   ├── elementBounds.ts   # Element bounds (selection, export, thumbnails)
│   │   ├── dynamics.ts        # Stroke dynamics: stabilizer, speed pressure, stroke defaults
│   │   ├── smooth.ts          # smoothPoints (airbrush, calligraphy, highlighter)
│   │   ├── fonts.ts, canvasFactory.ts, overlayColor.ts
│   │   ├── seededRandom.ts    # Deterministic RNG shared by brushes
│   │   ├── pathData.ts        # perfect-freehand outline → SVG path string
│   │   ├── color.ts           # hex → rgba helper (airbrush gradients)
│   │   └── index.ts
│   ├── geometry/             # Diagram math: arrow, labels, outline, textLayout
│   ├── stamp/                # Stamp engine: StampBrush, tips, grain, lazy assets (§4.2.1)
│   ├── tiles/                # Tiled rendering: LayerTiles, TileCache, Scheduler, layerDiff, renderBounds (§4.1)
│   ├── brush-formats/gimp.ts # .gbr/.gih parser used by `npm run brushes`
│   └── brushes/
│       ├── FreehandBrush.ts   # key "ink" — perfect-freehand outline
│       ├── MarkerBrush.ts     # key "marker" — flat, multiply build-up
│       ├── HighlighterBrush.ts# key "highlighter" — wide translucent multiply
│       ├── AirbrushBrush.ts   # key "airbrush" — Gaussian-blurred stroke
│       ├── CalligraphyBrush.ts# key "calligraphy" — angle-dependent nib ribbon
│       ├── stampBrushes.ts    # Pencil, Charcoal, Pastel, Watercolor, Gouache, …
│       ├── rav89Brushes.ts    # 23 brushes from the RaV89 pack
│       ├── SprayBrush.ts      # key "spray" — seeded dot scatter (legacy)
│       └── TextureBrush.ts    # key "texture" — layered noisy outline (legacy)
│
├── models/          # MST data models
│   ├── CanvasModel.ts         # THE central model: layers, tools, selection, history
│   ├── LayerModel.ts          # DrawLayer + ImageLayer union + Element union
│   ├── ShapeLayerModel.ts     # ShapeElement (data only)
│   ├── ArrowElementModel.ts   # ArrowElement (ends, bindings, bend, heads, label)
│   ├── TextElementModel.ts    # TextElement
│   ├── ImageLayerModel.ts     # ImageLayer + factory helpers
│   ├── SharedModels.ts        # Point, Stroke, BrushSettings
│   ├── VaultModel.ts          # Saved drawings list + persistence orchestration
│   └── SettingsModel.ts       # localStorage-backed user settings
│
├── stores/
│   └── root-store.ts          # RootStore = canvas+vault+settings; onPatch → renderVersion
│
├── components/       # React UI (see §7)
│   ├── canvas-view.tsx        # Desktop editor shell (top bar, panels, autosave)
│   ├── drawing-canvas.tsx     # Canvas host: mounts engine, wires InputManager
│   ├── layers-panel.tsx       # Layer list + thumbnails (wrapped by studio LayersStudioPanel)
│   ├── export-dialog.tsx      # Export + share dialog (preview pane + options column)
│   ├── share/ShareViewer.tsx  # Shared viewer for /share and /share/[id] (pages only load data)
│   ├── import-dialog.tsx      # Image import (file/URL/drag)
│   ├── NewDrawingDialog.tsx, PageSizeDialog.tsx, PageSizeForm.tsx # Page presets
│   ├── TextEditorOverlay.tsx  # In-place text/label editor
│   ├── ZketchMark.tsx         # Swoosh logo, redraws on hover
│   ├── MasonryColumns.tsx     # Vault masonry view
│   ├── layer-animation-controls.tsx
│   ├── valut-view.tsx         (note: "valut" typo is intentional/baked in)
│   ├── studio/                # drawing-screen shell, bottom bar, docks, panels, StrokeTrack, Settings page
│   ├── icons/index.tsx        # Generated icon components (SelectIcon, …); never edit by hand
│   └── ui/                    # shadcn primitives
│
├── services/         # Storage + IO
│   ├── DexieService.ts        # "DrawingVault" DB (drawings table)
│   ├── BlobStorageService.ts  # "ImageBlobs" DB (rasters + thumbnails)
│   ├── ExportService.ts       # PNG/JPG renderers (SVG method retained, UI hidden)
│   ├── ThumbnailService.ts    # Vault/layer thumbnail generator
│   ├── ImportService.ts       # File / URL / clipboard → blob
│   └── ShareService.ts        # Client for /api/share/*
│
├── utils/
│   ├── StrokeOptimizer.ts     # RDP simplification before save
│   ├── serializeLayers.ts     # MST layers → save format, cached per element snapshot
│   ├── ImageProcessingUtils.ts# validate/resize/compress/sanitize images
│   ├── brushMemory.ts         # Per-brush remembered settings (localStorage), presets, resets
│   ├── brushCategories.ts     # Picker category list + registry grouping
│   ├── dockLayout.ts          # Dock store: panel placement per layout
│   ├── page.ts                # PAGE_PRESETS + page helpers
│   ├── zoom.ts, viewport.ts   # Shared zoom clamp, fit-to-page
│   ├── accent.ts              # Accent colour list + installs the chosen accent
│   ├── cloneElements.ts       # Duplicate with labels + bindings kept intact
│   └── keyBindings.ts         # KEY_BINDINGS table + KeyBindingManager
│
├── hooks/            # useStores, useKeyboardShortcuts, useMobile, useCanvasResize, useSortableList
├── pages/            # Astro routes (see §10)
├── landing/          # Static landing page at / (see §10.1): doodles, player, pad, cards, pens
├── page-components/  # React page shells mounted by Astro
├── layouts/Layout.astro      # Head: title, description, canonical, OG/X cards, JSON-LD
├── config.ts         # SITE: name, url (zketch.zerro.dev), title, description, X handle
├── lib/og.ts         # Share image SVG (1200x630) for tools/build-share-images.ts
├── assets/og/        # Fraunces + Kalam fonts (OFL) for the share image
└── styles/global.css # Tailwind v4 theme + touch/zoom guards

tools/                # convert-brushes.ts, render-brush-previews.ts, build-share-images.ts
tests/                # Vitest suites (Node + @napi-rs/canvas)
vitest.config.ts      # Test config (alias @ → src)
icons/                # Removable icon pack: defs/, lib/, build.mjs, svg/, sprite.svg, gallery.html
public/               # favicon.svg, apple-touch-icon, brand/, brushes/, robots.txt
                      # (og/, favicon.ico, favicon-96.png are generated, gitignored)
```

> The dead `src/page-components/draw-pages.tsx/` duplicate folder was removed
> (Vite dynamic-import gotcha). Astro imports the correctly-named
> `src/page-components/draw-pages/` folder.

---

## 4. Rendering engine (`src/engine/`)

### 4.1 `CanvasEngine.ts` — how a frame is drawn

The engine mounts **three stacked `<canvas>` elements** into a root `<div>`:
`bg` (background), `display` (content), `ui` (overlay, `pointer-events:none`).
DPR-aware resizing happens in `resize()`.

Render loop (`loop()`): re-renders only when `invalid` is true (RAF-driven).
`invalidate()` sets the flag and calls `config.onInvalidate`.

Per frame (`render()`):

1. `renderBackground()` — white fill, `GridRenderer`, or checkerboard for
   transparent.
2. `renderStrokes()` — content:
   - If `getLayers()` is empty → legacy mode renders `getStrokes()` directly.
   - Else, for each **visible** layer in order: image layers and the animating
     layer draw straight onto `display` with the view transform; **draw layers
     come from tiles** (`engine/tiles/`, below), composited with
     `globalAlpha = layer.opacity`.
   - The view transform uses an integer device origin
     `round(dpr * pan)` and scale `dpr * zoom`, for tiles and for the previews,
     so tiles land on whole device pixels and a committed stroke does not shift.
   - Preview stroke, shape and arrow (`setPreviewStroke/Shape/Arrow`) are drawn
     last, on top.
3. `renderOverlay()` — selection outlines, transform handles (arrow handles for a
   single arrow: both ends and the middle), marquee, bind highlight
   (`setBindHighlight`) and the eraser circle cursor.

#### Tiled rendering (`engine/tiles/`)

Each draw layer has a `LayerTiles`. Content is cached in **tile sets**: a set has a
render scale `s` (device px per world unit; the view uses `s = dpr * zoom`
exactly) and `512 x 512` device-px tiles on a world-aligned grid (tile `(tx,ty)`
is rendered with `setTransform(s, 0, 0, s, -tx*512, -ty*512)`). Empty tiles are
never allocated.

- **Every frame** (`renderStrokes`): `ChangeTracker.next` gives each draw layer the ids
  that changed anywhere this frame (plus ids it missed while hidden; a layer that leaves or
  joins counts as all its ids changed, so arrows bound across layers follow) →
  `LayerTiles.update` (element diff via `layerDiff`, generous `renderBounds`
  per element; pending-erase and hidden-element changes are extra dirty ids) →
  `syncVisible` → `schedule` → `composite`, then `TileCache.evict`.
- **Edits are synchronous**: visible tiles of the current scale inside an edited
  region render in the same frame (`syncVisible`). Appending one element draws it
  onto every ready tile it touches (all sets). Other dirty tiles are skipped as
  fallbacks until re-rendered.
- **View changes are time-sliced**: `Scheduler` jobs run in the RAF loop after the
  frame (6 ms budget during a gesture, 10 ms otherwise), resumable per element.
  Order: visible tiles centre-out, overview, one prefetch ring. The current
  scale is only scheduled once zoom has been still for 150 ms; until 450 ms
  after a zoom, sharp tiles swap in only when all visible ones are ready (no
  patchwork). Panning at a fixed zoom reuses tiles and fills exposed ones.
- **Fallbacks** (per tile slot, never two sources in one slot): the target tile,
  else the most recently used other set whose covering tiles are all clean
  (scaled, clipped to the slot), else the **overview** (pinned set at a
  power-of-two scale fitting the layer into `overviewPx`, 512–2048 px, sized so
  all overviews stay under ~24 MB), else nothing.
- **Memory**: `TileCache` budget 160 MB (96 MB on coarse-pointer / small
  screens), LRU by last composite, current view protected, canvases pooled.
  `LayerTiles` of layers the engine stops receiving (hidden/focus) are disposed
  after 30 s.
- Brush assets or fonts finishing loading mark tiles **stale** (fonts also re-measure text bounds via `remeasure`; tiles are still drawn, then
  re-rendered by the scheduler). Debug: `localStorage["zk-debug-tiles"] = "1"`
  draws tile borders and the job count.

`renderDrawLayer` (`engine/render/`) is what a tile renders with,
the one renderer every consumer shares (engine, `ExportService` page and
infinite paths, `ThumbnailService`, layer thumbnails). It draws every element
**in array order** (one stacking order, newest on top): strokes via
`renderStroke` (eraser strokes use `destination-out` and cut whatever lies under
them on that layer, shapes included), shapes via `renderShape`, arrows via
`renderArrow`, free text via `renderText`, and each label right after its
container. `buildElementLookup(layers)` gives arrows and labels an id → element
map across all layers.

> **Key rule:** erasers are just strokes with `brushStyle: "eraser"`. The engine
> renders them with the `ink` brush but forces `taperStart/End = 0` and
> `opacity = 1` so short strokes still leave a hole. Undo/redo needs no special
> casing because they are normal history entries.

Image layers: `renderImageLayer` loads the blob via `BlobStorageService.getBlobUrl`,
caches the `HTMLImageElement`, and draws with rotation around center.

Fixed pages (`setPage` / `setSurround`): `renderBackground` fills the surround,
draws the page with a soft shadow and the page background (white / world-space
grid aligned to the page / world-space checker pattern) clipped to the page;
after layers and previews `renderPageVeil` draws one surround-coloured fill at
72% with an even-odd hole for the page, so overdraw reads as off the page.
Both run every frame on top of the tile composite.

### 4.2 Brush registry

`BrushRegistry` (`engine/render/BrushRegistry.ts`) maps `key → Brush` and is a
shared singleton (`brushRegistry`) populated by `registerDefaultBrushes()`.
Registered: `FreehandBrush("ink")`, `MarkerBrush("marker")`,
`HighlighterBrush("highlighter")`, `AirbrushBrush("airbrush")`,
`CalligraphyBrush("calligraphy")`, `SprayBrush("spray")`, `TextureBrush("texture")`
(legacy, hidden). Geometric brushes are procedural (no image assets): ink/marker
use `perfect-freehand` outlines, calligraphy draws per-segment variable-width
round-capped strokes (angle-dependent width; cheap),
highlighter is a thick `multiply` polyline, airbrush stamps soft radial gradients.
`Brush.presets` (metadata) drives the UI variant picker.
Eraser resolves to `"ink"`. `renderStroke` (`engine/render/renderStroke.ts`) owns
the eraser→`destination-out` special-casing; `CanvasEngine` calls it for live
rendering, and export/thumbnails call the same function. Strokes carry their full
render params (`thinning/smoothing/streamline/taperStart/taperEnd/easing`), so
committed strokes and exports are **deterministic** — changing current brush
settings never alters already-drawn strokes. `engine/easing.ts` resolves the
stored easing name to a function. `Brush` metadata is optional: `label?` (UI text),
`category?` (picker group), `maxSize?` (size slider max, default 100; the store
clamps at 400) and `defaults?: Partial<BrushOptions>` (per-brush fallback options consumed by
`createGetBrushOptions`, so a new brush usually doesn't need to touch
`brushOptions.ts`). Shared helpers: `easingFn` (`engine/easing.ts`) and
`seededRandom` (`engine/render/seededRandom.ts`). The registry exposes
`register/unregister/get/has/keys/all` and is re-exported from `engine/index.ts`.
**To add a brush**: implement `Brush { key; label?; defaults?; render(...) }` in
`src/engine/brushes/`, register it in `registerDefaultBrushes()`, add its key to
`BRUSH_STYLES` in `engine/types.ts` (the `BrushStyle` type and the MST enums in
`SharedModels.ts`/`CanvasModel.ts` derive from it; never remove or rename a key,
saved strokes reference it), give it a `category` and `strokeSettings`, add a
dock icon, and run `npm run brushes:previews` (the picker and mobile list read
the registry; see §4.2.2). PNG/JPG/thumbnail parity is
automatic via the shared `renderStroke`. Set `legacy = true` to keep a brush
render-only (excluded from the dock picker).

### 4.2.1 Stamp brush engine (`engine/stamp/`)

Textured media are `StampBrush` instances configured by a `StampSpec`
(`engine/brushes/stampBrushes.ts`): tip ids, spacing (fraction of size), flow,
scatter (perpendicular, or both axes with `scatterBothAxes`), `count` (dabs per
step), size/flow jitter and pressure response, angle mode
(fixed/direction/random, `directionOffset` rotates direction-following tips),
roundness, `keepAspect` (fit the tip's longer side to the size instead of
squashing it into a square; the original brushes predate it and keep the square
fit so saved strokes render unchanged), `flip` (random mirror; left-right on
screen, so a fixed-angle brush whose tip is stored sideways, like Pine at 90°,
mirrors the tip's y axis), `pickTips` (lets the user choose which tips a stroke
uses), and optional paper `grain` (`{id, scale, depth}`).

- **Tip choice** (`pickTips`, used by Bare Tree): `Brush.tipChoices` exposes the
  tip ids, the Presets panel shows them as toggles (`TipPicker`), and
  `utils/brushMemory` keeps the set per brush (`getTipSet`/`toggleTip`, saved
  with the brush memory). A new stroke stores the indices in `stroke.tips`
  (null = every tip), so saved strokes, export and thumbnails keep their trees.

- **Dabs** are placed along a fixed 2-pass smoothed path (`stampSmooth`) at
  `spacing × size` and drawn as tinted tip canvases with a per-dab affine
  transform. Every jitter comes from `seededRandom(hashString(stroke.id) + dab
  index)`, so canvas, thumbnails and export are identical.
- **Stroke buffer**: dabs accumulate at `flow` in an offscreen buffer (clipped
  to the stroke's device bounds), grain is applied with `destination-in` using a
  world-anchored pattern, and the buffer is composited once at the stroke's
  `opacity` (self-overlap never exceeds opacity; eraser `destination-out` still
  applies to the composite).
- **Tips** (`stamp/tips.ts`): registry of white-on-alpha mask canvases;
  `round-hard/round-medium/round-soft` are procedural; tinted copies are cached
  per `tip|color` (LRU 96). **Grain** (`stamp/grain.ts`): tileable grayscale
  values → per-depth alpha masks; `paper-noise` is procedural seeded value noise.
- **Live preview** (`stroke.live`, set on the drawing-canvas temp stroke): dabs on
  segments whose smoothed points can no longer change are accumulated once in a
  persistent canvas; each frame only draws new settled dabs plus the moving
  tail. The preview stroke uses the final stroke id (generated at pointer-down),
  so the committed render is pixel-identical, and the commit reuses the live
  buffer (integer-offset blit onto the overscanned layer) instead of re-stamping.
- Offscreen canvases come from `render/canvasFactory.ts` (`setCanvasFactory` lets
  Node tests inject `@napi-rs/canvas`).
- **Assets**: a tip/grain id is a path under `public/brushes/` without `.png`
  (e.g. `revoy-2025-01/charcoal-2`). On first use of an unknown id, `tips.ts` /
  `grain.ts` call the loader installed by `stamp/assets.ts`
  (`installBrushAssetLoader`, called from the `CanvasEngine` constructor), which
  fetches and decodes the PNG and registers it; until then a procedural soft
  tip / paper noise is used. `onBrushAssetsChanged` makes the engine drop its
  layer caches and re-bake. Only assets of brushes actually used are fetched.
- **Asset pipeline**: `npm run brushes` (`tools/convert-brushes.ts`) downloads
  source archives (sha256-verified, cached in `.brush-cache/`), parses
  GIMP `.gbr/.gih` via `engine/brush-formats/gimp.ts` and Photoshop `.abr`
  (tips by preset name, patterns by name) via `ag-psd`, writes white-on-alpha
  tip masks (per-tip `max` up to 768 px for large stamps) and grayscale grain
  tiles, per-source `LICENSE.txt`/`README.md`, and
  `public/brushes/manifest.json`. Sources without a direct download URL (the
  RaV89 `.abr`) must be placed in `.brush-cache/` by hand; the converter
  verifies their sha256. Never commit or serve a raw brush pack: only converted
  tips ship. Credits: `THIRD_PARTY_ASSETS.md`. Only bundle sources whose license
  allows use inside the app (CC0, or free-for-commercial-use without
  redistribution of the files themselves).

### 4.2.2 Stroke settings and per-brush memory

- Every stroke records `input` (`pen`/`mouse`/`touch`, from the pointer that drew
  it). **Strokes without `input` are pre-2026-10-17 strokes and every brush
  renders them exactly as before** (pixel fingerprint harness in
  `.work/bench/fingerprint.test.ts`). Strokes with `input` honour the Stroke
  settings, all stored on the stroke: Width variation = `thinning`, Stabilizer =
  `streamline`, Smoothing = `smoothing`, Taper = `taperStart`/`taperEnd` (px).
- `engine/render/dynamics.ts`: `stabilize` (prefix-stable lag filter, so live
  preview and commit match), `speedPressure` (perfect-freehand's simulation),
  `strokePressures` (pen → real pressure; mouse/touch → speed-based,
  `0.5 + (speed − 0.5)·(2·thinning − 1)`: constant at the default 0.5, faster =
  thinner above it, faster = thicker below), `pressureGain` (pen only: 2 ×
  thinning, multiplies a brush's built-in pressure response; 1 otherwise),
  `taperFactor`, `strokeDefaultsFor(brush)`.
- Pen and Marker use perfect-freehand with `simulatePressure: input !== "pen"`.
  Stamp brushes apply stabilizer/pressure/taper before `stampSmooth`; a stamp
  stroke with an end taper is re-rendered in full at commit (never reuses the
  live buffer). Calligraphy scales and tapers the nib; Highlighter/Airbrush only
  stabilize. Eraser strokes render with `input: null` and fixed shaping.
- Each brush declares `strokeSettings` (which Stroke controls the panel shows)
  and `strokeDefaults` (Pen 0.5/0.5/0.5/30/30, Marker taper 0; everyone else
  `NEUTRAL_STROKE_DEFAULTS`: no stabilizer, no taper, so default strokes look as
  before).
- `utils/brushMemory.ts` (installed once in `stores/root-store.ts`): a MobX
  reaction on `currentBrushStyle` saves the outgoing brush's size/opacity/angle/
  softness/Stroke values and loads the incoming one (or its first preset +
  Stroke defaults), whichever path switched it (picker, shortcuts, mobile list);
  eraser is skipped. Persisted in localStorage `zketch-brush-memory-v1`.
  `applyPreset`/`resetPreset`/`resetStroke`; "edited" is computed against the
  base preset. Drawing code keeps reading `currentSize`/`brushSettings`.
- Saving keeps the exact points of strokes with `input` (only the 2-decimal
  trim in `StrokeOptimizer`); RDP simplification would change the point-indexed
  stabilizer/speed pressure on reload. Older strokes are still simplified.
- Picker previews: `npm run brushes:previews` (`tools/render-brush-previews.ts`,
  runs via vite-node; also chained after `npm run brushes`). Re-run after adding
  or retuning a brush.

`brushOptions.ts::createGetBrushOptions(settings)` converts the per-draw brush
settings (`thinning/smoothing/streamline/taper/easing`) into `BrushOptions`,
with per-brush overrides. `drawing-canvas.tsx` passes this as
`config.getBrushOptions`.

### 4.3 `TransformController.ts`

Stateless-ish helper (exported singleton `transformController`). Handles:
world↔screen conversion, rotated-rect hit-testing, handle positions/rendering,
and move/resize/rotate math. Handles: `nw/ne/se/sw` + `rotate` + `move` (inside
bbox). `getHandlePositions`/`getBoundingBoxCorners`/`hitTest` accept an optional
`paddingWorld` to inflate visuals/hit-testing without changing transform math.

### 4.4 `InputManager.ts`

Standalone class attached to the canvas root. Tracks all active pointers,
classifies intent (`draw` / `gesture` / `ignore`), and emits callbacks.

- **Touch modes**: `auto`, `stylus-only`, `touch-draw` (from `SettingsModel`).
- **Palm rejection**: while a pen is down, touch pointers are ignored.
- **Gestures**: 2-finger pinch+pan combined; single-finger pan for stylus-only /
  pan-mode / middle-mouse; 5px / 50ms start threshold.
- **Mid-stroke cancel**: a second finger cancels the in-progress stroke and
  converts to gesture.
- Callbacks: `onDrawStart/Move/End/Cancel`, `onGestureStart/Update/End`,
  `onHoverMove`. `setPanOverride(bool)` is used for the Space-to-pan override.

### 4.5 `AnimationPlaybackEngine.ts`

Replays a draw layer's strokes over time using each stroke's `startTime` /
`duration`. **Gap compression** collapses idle gaps > `maxGap` (default 500ms)
so a drawing made across hours plays in seconds. Supports play/pause/stop,
seek (playback pauses while the timeline is dragged and resumes on release),
speed (0.5/1/2/4/8/16/32), loop, partial strokes for progressive draw-on, and
emits `onFrame(info, visibleStrokes)`. Shapes are not animated (they stay static).

---

### 4.6 Diagrams: geometry, arrows, text

- `engine/geometry/` is pure (no DOM): `textLayout` (`FONT_STACKS`,
  `fontString`, `layoutText` with a passed-in `measure`), `outline` (rotated
  boxes, `outlinePoint` = where a ray to an element's centre meets its outline
  plus a gap), `arrow` (`resolveArrow`: bound ends aim at the element centre,
  `bend` becomes a quadratic curve through the middle handle; sampling,
  distance, sub-curves, arrowheads), `labels` (`labelPlacement` /
  `textPlacement`: labels wrap inside shapes, sit horizontally on arrows).
- Arrow ends resolve **at render time**, so they follow a dragged shape every
  frame; `CanvasModel.syncArrows()` runs at the start of every `saveToHistory`,
  writes resolved ends back, frees bindings to missing elements and deletes
  orphaned labels.
- Fonts: Kalam and JetBrains Mono load with the UI fonts from Google Fonts.
  `render/fonts.ts` caches `measureText`, requests fonts on first use and
  re-bakes on `document.fonts` `loadingdone`; export and thumbnails await
  `ensureFonts` (3 s cap) first.
- Looks (`look` on shapes and arrows): `clean` (vectors) plus four hand-drawn
  looks in `render/sketchy.ts`, each a brush from `LOOK_BRUSHES`: `sketchy` (Pen,
  a quick marker sketch), `pencil`, `crayon`, `charcoal` (textured stamp brushes,
  sized up to match). Sharp shapes draw each edge as its own stroke with one gentle
  bow and a small overshoot past the corners; rounded shapes (corner radius 4+)
  and ellipses are one loop with bowed sides, slightly uneven corners and an end
  that runs past the start. Arrow bodies bow once and end flush with the heads;
  open heads are two arms drawn from the tip. All seeded per element.
  `studio/LookPicker.tsx` shows the five as tiles with a live stroke preview.
- Arrow bend is measured against the raw chord (bound ends use the element
  centres), so dragging the middle handle never feeds back into the clipped ends.
- Text editing: `components/TextEditorOverlay.tsx` is a textarea laid over the
  canvas (a sibling of the canvas root) at the element's screen box; the engine
  hides that element while `CanvasModel.editingTextId` is set. Empty commits
  delete; one history entry per edit.

## 5. Data models (`src/models/`)

### 5.1 Layer model (`LayerModel.ts`)

- `Element` MST union dispatches through `elementKind` (`engine/types.ts`):
  `kind: "arrow"` → `ArrowElement`, `kind: "text"` → `TextElement`, `shapeType`
  present → `ShapeElement`, else `Stroke`. Every consumer asks `elementKind` /
  `isStrokeElement` / `isShapeElement` / `isVectorElement`, never `"shapeType" in`.
- `ArrowElement` (`ArrowElementModel.ts`): `start`/`end` (last resolved ends),
  `bend` (midpoint offset / chord length), `startBinding`/`endBinding`
  (`{elementId}` of a shape or free text on any layer), heads, stroke, `look`,
  `seed`. `TextElement` (`TextElementModel.ts`): `x`, `y`, `text`, `fontFamily`
  (hand / sans / mono), `fontSize`, `align`, `color`, `rotation`, `containerId`
  (set for labels); `width`/`height` are measured views and `setSize` scales the
  font. `ShapeElement` gains `look` (clean / sketchy) and `seed`.
- `DrawLayer` = `{ id, name, visible, locked, opacity, type:"draw",
  elements: Element[] }`. Views: `strokeElements`, `shapeElements`,
  `findElement`, `strokeCount`, `shapeCount`. Actions: add/remove/clear
  (incl. `clearStrokes` which keeps shapes).
- `ImageLayer` = `{ id, name, blobId, naturalWidth/Height, x, y, width, height,
  rotation, aspectLocked, visible, locked, opacity }`.
- `Layer` union dispatches on `type`.

> Legacy aliases `IStrokeLayer`/`IShapeLayer`/`StrokeLayerLike` remain for
> back-compat; canonical names are `IDrawLayer` / `IShapeElement`.

### 5.2 `CanvasModel.ts` — the core model

State highlights:

- `strokes` (legacy top-level array, still written by some paths), `layers`,
  `activeLayerId`, `focusedLayerId` (solo), `layerDisplayMode`.
- Tool state: `currentColor`, `currentSize`, `eraserSize`, `currentBrushStyle`
  (`ink|eraser|spray|texture`), `background`, `zoom/panX/panY`,
  `brushSettings` (thinning/smoothing/streamline/taper/easing/opacity).
- `activeTool`: `"pan" | "select" | "brush" | "shape"`.
- `page: {x, y, width, height} | null` — a **fixed-size page** in world units
  (null = Infinite drawing). Part of the undo snapshot; `setPage` records
  history (resize), `loadPage` doesn't (load/new). `clear()` keeps the page.
  Helpers in `utils/page.ts` (presets, 64..4096 clamp, `resizePage` keeps the
  centre, `fitPage`, `exportScaleCap`, `SURROUND` colours). Zoom is clamped
  by `utils/zoom.ts` (0.1..5); `zoomAt(z, sx, sy)` zooms about a screen point.
- Shape tool state: `currentShapeType`, `shapeStrokeWidth`, `shapeCornerRadius`,
  `shapeOpacity`, `shapeFillColor`, `colorTarget` (`stroke|fill`).
- Selection: `selectedElements: {layerId, elementId|null}[]`,
  `selectionAnchor: {x,y,width,height,rotation}|null`, `interactionMode`.
- Volatile: `history` / `historyIndex` (max 50), `renderVersion`,
  `pendingEraserDeletes: Set<string>` (replaced, never mutated, so the engine
  can key its layer cache on the set's identity).

Important views: `isEmpty`, `activeLayer`, `visibleLayers`,
`flattenedStrokes`, `exportLayers`, `selectedTransformableLayer`,
`selectedShapeElements`, `selectedStrokes`, `selectionUnionBounds`,
`selectionCount`, `canUndo/canRedo`. `flattenedStrokes`/`exportLayers` honor
`focusedLayerId` and per-layer visibility, so exports match what the canvas shows.

Important actions (grouped):
- **History**: `saveToHistory` (snapshot of strokes + layers + camera +
  selectionAnchor), `undo`, `redo`, `clearHistory`, `bumpRenderVersion`.
  `afterCreate` seeds history.
- **Tools**: `setBrushStyle`, `setPenSize`, `setEraserSize`, `setColor`
  (routes to stroke or fill of selected shapes / strokes), `setColorTarget`,
  `setBackground`, `setZoom`, `setPan`, `setBrushSettings`, `setActiveTool`
  (clears selection for any non-`select` tool), `setInteractionMode`.
- **Layers**: `addLayer`, `removeLayer`, `duplicateLayer`, `moveLayerUp/Down`,
  `mergeVisibleLayers`, `flattenAllLayers`, `clearLayer`, `initializeLayers`,
  `loadLayers` (migrates legacy `stroke`/`shape` layer types → `draw`),
  `setLayerOpacity`, visibility/lock/focus/rename.
- **Content**: `addStroke`, `addStrokeToActiveLayer` (auto-creates a draw layer
  if active is an image), `addShape` (returns `{layerId, elementId}`; auto-creates
  a draw layer above an image), `addImageLayer`, `clear`, `clearAllLayers`.
- **Selection/transform**: `selectLayer`, `selectElement`, `addToSelection`,
  `toggleSelection`, `selectInBounds` (marquee), `deselectLayer`,
  `moveSelectedBy`, `recomputeSelectionAnchor`, `setSelectionAnchorRotation`,
  `setSelectionAnchorBounds`.
- **Eraser pending deletes**: `markPendingErase`, `clearPendingErase`,
  `commitPendingErase`.
- **Delete**: `removeElement`, `removeSelectedElements`.
- **Diagrams**: `addArrow`, `addText`, `editLabel`, `commitTextEdit`,
  `duplicateSelection` (Ctrl+D; labels travel with containers, bindings inside the
  copied set are remapped), `reorderSelection("front" | "back")`,
  `targetDrawLayer(fallback)` (Simple: falls back to the topmost usable draw
  layer or makes one). Tool defaults: `arrowKind`, heads, `arrowStrokeWidth`,
  `elementLook` (first-time default sketchy), text family / size / align.

### 5.3 `VaultModel.ts`

Holds `SavedDrawing[]` persisted in Dexie (`DrawingVault` DB, table `drawings`).
`layers` are stored as **frozen JSON** (`ILayerData[]`, supporting legacy
`stroke`/`shape` + new `draw`/`image`). Handles add/delete/rename/update,
thumbnail + image-blob cleanup, storage info, and orphan-blob cleanup. Writes
are per drawing (`persistDrawing(id)` → `DexieService.saveDrawing`), never the
whole vault. The
on-disk snapshot interfaces live here (`IStrokeData`, `IShapeElementData`,
`IDrawLayerData`, `IImageLayerData`, `IShapeLayerData`, `ISavedDrawingData`).
`ISavedDrawingData.page?` stores a fixed page; absent = Infinite (old
drawings need no migration).

### 5.4 `SettingsModel.ts`

Persisted to `localStorage` key `drawing-app-settings`: defaults (pen size,
brush, color, background), export settings (format/quality/transparent/scale),
UI prefs (autoHideDock/delay/showGrid/snapToGrid), `touchMode`,
`eraserMode`, `accent`, `theme` (`light` default / `dark` / `system`) and
`surroundMode` (`auto` default follows the theme / `light` / `dark`, the
workspace tone around fixed pages; a legacy `surround: "dark"` migrates to
`dark`, anything else to `auto`).

---

## 6. State flow & persistence

```
root-store.ts
  ├─ canvasModel, vaultModel, settingsModel
  └─ onPatch(canvasModel) ──(microtask-batched, ignores /renderVersion|/history)──> bumpRenderVersion()

drawing-canvas.tsx
  ├─ reaction(renderVersion) → engine.invalidate()
  ├─ reaction(pan/zoom) → engine.setPanZoom
  ├─ useEffect[background] → engine.setBackground
  ├─ reaction(page) → engine.setPage; reaction(resolveSurround(surroundMode, theme)) → engine.setSurround
  └─ useEffect[animatingLayerId] → engine.setAnimationState

canvas-view.tsx
  ├─ reaction(renderVersion) → debounce 500ms → performSave()   (autosave;
  │    reschedules while canvasStore.isInteracting, i.e. a pointer is down)
  ├─ beforeunload warns if isDirtyRef
  └─ performSave(): serializeLayers → ThumbnailService.generateThumbnailBlob
                     → BlobStorageService.storeThumbnail(blob)
                     → vaultStore.updateDrawing / addDrawing
                     → history.replaceState("/draw/<id>") on first save
```

`renderVersion` is the single repaint signal. It is **auto-bumped** via MST
`onPatch` in `root-store.ts` (do not add manual `renderVersion++`). History is
still captured manually by calling `saveToHistory()` at the end of mutating
actions.

Persistence layers:
- **Drawings metadata + frozen layers** → Dexie DB `DrawingVault` (`DexieService`).
- **Image blobs + thumbnails** → Dexie DB `ImageBlobs` (`BlobStorageService`,
  IDs prefixed `blob_` / `thumb_`; URLs cached + revocable).

---

## 7. UI components (React)

- **`drawing-canvas.tsx`** — the heart of interaction. Mounts `CanvasEngine`,
  mounts `InputManager` (callbacks wired in a separate effect so closures stay
  current), converts screen→canvas coords, and implements: draw/erase preview,
  shape drag-create + Shift constrain, select tool (hit-test, marquee, shift
  toggle, group drag), transform (single vs group via `groupTransformRef`),
  eraser pending-delete scan, wheel zoom (Ctrl) / pan (Shift+wheel), Space
  pan override, clipboard image paste, and the eraser circular cursor.
- **`canvas-view.tsx`** — desktop editor logic (load/autosave, rename, export/
  import/clear dialogs, animation playback state and canvas lock); renders the
  studio shell and passes animation handlers through `studio/StudioContext`.
- **`studio/`** — the drawing screen UI (spec `.work/specs/2026-10-17-app-redesign-design.md`):
  - `StudioShell` — the canvas spans the whole row under the left/right docks
    and never moves or resizes when they open; `[data-canvas-viewport]` is the
    visible area between them (`utils/viewport.ts`: `visibleCanvasRect`,
    `fitView` fits the page or puts the origin at the visible top-left).
    Desktop (≥1100 px) docks sit beside the viewport; below 1100 px they
    overlay it and close on pointer-down on `[data-canvas-root]`.
    Shows the layers strip when the Layers dock is closed and reopen tabs for
    closed sidebars.
  - **Simple layout** (`layout: "simple"`): no docks, bar or layers strip.
    `SimpleToolbar` (bottom centre, the Zketch signature; keys 1 Select, 2 Rectangle, 3 Diamond,
    4 Ellipse, 5 Arrow, 6 Line, 7 Pen, 8 Text, 0 Eraser, H Hand, handled in
    `useKeyboardShortcuts`), `PropertiesCard` (left, only with a tool or a
    selection) and `ZoomCluster` (bottom left).
  - `ElementProperties` — one properties body for the Simple card and the
    Properties panel (formerly Shapes): stroke, fill, width, look, corners,
    arrowheads, font, size, align, opacity, front/back, duplicate, delete; each
    change is one undo step.
  - `TopLeftBlock` (back to vault; Z menu: rename, vault, import, export, background, page
    size… for fixed drawings (`PageSizeDialog`, resize around the centre then
    refit), touch & stylus, layout; name input; save status), `TopRightBlock` (undo,
    redo, clear canvas, Share → export dialog).
  - `BottomBar` — tools (select, draw, erase, shapes, pan), tool-dependent area
    (brush chip + Size/Opacity, eraser size + whole-stroke mode, shape kinds +
    stroke; empty for Select and Pan), colour + swatches, zoom/fit, deck toggle. The brush chip
    toggles the deck when Brushes sits in it; with Brushes in a sidebar it is a plain label.
  - `DockArea` (one per dock; drag-and-drop target with drop line),
    `PanelFrame` (grip, title, collapse, dock-left/bottom/right buttons;
    `PanelVariantContext` = deck | side | popover), `panels/` (Brushes,
    Presets, Stroke, Colour with `HsvPicker`, Layers + `LayersStrip`, Shapes;
    registry in `panels/index.ts`). Layer rows and strip thumbnails reorder
    with `hooks/useSortableList` (pointer drag from the grip or the card,
    neighbours slide aside, Escape cancels) and open the layer menu on
    right-click.
  - `StrokeTrack` — the only slider style for app settings: a picture of the
    setting (`trackShapes.ts`: size wedge, opacity checkerboard, stabilizer
    wobble, width variation, taper, flat), notch knob, value tag, keyboard,
    double-click to type, `role="slider"`.
  - Dock state: `utils/dockLayout.ts` (panel → dock/order/collapsed, dock
    open flags, layout bottom | sidebars | simple | custom; Sidebars puts colour + layers left and
    presets, brushes, stroke, properties right; localStorage `zketch-dock-layout-v1`, bad data or
    the retired `minimal` falls back to Bottom deck). In a sidebar the layer list caps at about five
    rows and scrolls on its own.
- **Dock motion and dragging**: `studio/DockSlot.tsx` animates each dock's
  width/height (200 ms) and unmounts it after closing; the canvas sits under
  the docks, so the drawing stays put.
  Side panels collapse with a grid-rows reveal (`PanelFrame`). While a panel
  header is dragged (`dockLayout.dragging`), `StudioShell` shows drop zones for
  docks that are hidden; open docks take the drop themselves. In tablet
  overlay mode, drawing hides docks through `dockLayout.overlayHidden`
  (session-only, never persisted); use `isDockShown(dock)` for visibility.
- **Dialogs** (`ui/dialog.tsx`): dark `bg-zk-surface` sheet, 150 ms fade +
  0.97 scale in place. Never add shadcn `slide-in-from-*` classes to centred
  dialogs: tw-animate's transform stacks on Tailwind 4's `translate` centring
  and the dialog flies in from the corner. Dialogs that shouldn't show a focus
  ring on open focus the content (`onOpenAutoFocus` → preventDefault + focus).
- **Vault** (`valut-view.tsx`): studio chrome; grid / masonry / list choice in
  localStorage `zketch-vault-view` (masonry = `MasonryColumns`, shortest-column
  layout keeping recency order, cards at the page aspect; grid/list show fixed
  pages contained on the surround tone); New drawing opens `NewDrawingDialog`
  (justified masonry wall of real-shape tiles + Custom view with
  `PageSizeForm`; remembers the last choice in `zketch-new-canvas`; `/?new=1`
  and Ctrl+N open it) which navigates to `/draw?page=WxH` or `/draw`; delete goes through a confirm dialog;
  Settings opens the same `SettingsPage`.
- **`studio/SettingsPage.tsx`** — full-page Settings over the studio (Z menu →
  Settings, Esc closes; key events stop at the page so drawing shortcuts don't
  fire): Appearance (theme Light / Dark / Match system with mini studio
  previews; 5 accents + custom HSV, live preview), Layout (3 layouts +
  reset), Canvas (default background for new drawings, applied in
  `canvas-view` when a new drawing starts; surround Auto / Light / Dark), Drawing (touch & stylus mode,
  eraser mode), Shortcuts (from `KEY_BINDINGS`, one row per action).
- **Brand**: the Zketch mark is a swoosh with two fading "earlier frames"
  (`components/ZketchMark.tsx`, coloured with the accent in-app). Containers with
  `zk-logo-hover` replay it drawing left to right on hover (`global.css`
  `zk-swoosh`, off under reduced motion). Files: `public/favicon.svg` (one trailing
  frame for small sizes), `public/brand/` (`zketch-mark.svg`, `zketch-icon.svg`
  dark tile, PNG exports), `public/apple-touch-icon.png`.
- **Icons**: every icon comes from `components/icons` (`<PencilIcon className="h-[18px] w-[18px]" />`;
  `size`, `className`, `aria-label`; stroke width is fixed, so no `strokeWidth`).
  The components are generated by `npm run icons` from the drawings in the
  repo-root `icons/` pack (centreline definitions in `icons/defs/*.mjs`, style
  rules in `icons/README.md`). The app never imports from `icons/`; the pack can
  be deleted without breaking the build. To add an icon to the app: draw it in
  `icons/defs/`, add its name to `icons/app.json`, run `npm run icons`.
- **Tokens, themes and accent**: `styles/global.css` defines `--zk-*` colours (Tailwind
  `bg-zk-surface`, `text-zk-muted`, `bg-zk-accent`, …; one-off tokens such as
  `--zk-well`, `--zk-scrim`, `--zk-shadow-*` are used as `bg-(--zk-well)`) and
  `font-display` (Fraunces) / `font-ui` (Instrument Sans); shadcn variables map
  onto `--zk-*`. `:root` holds the light "Mist" theme (cool greys, the default);
  `[data-theme="dark"]` on `<html>` holds the dark values. `Layout.astro` sets
  `data-theme` before first paint from `drawing-app-settings.theme` (app pages
  only; the landing and 404 pass `appTheme={false}` and keep their own palette).
  `utils/theme.ts` `installTheme` keeps it in sync with `SettingsModel.theme`
  and the OS for `system`, updates `meta[name=theme-color]`, and exposes
  `themeState.resolved` / `themeInk()` for canvas-drawn UI (brush preset and
  look previews) that can't read CSS variables. Never hardcode a UI colour in a
  component: add a token with a light and a dark value. Canvas content (page,
  grid, export) is not themed.
  `SettingsModel.accent` (default Coral `#FF6B5B`) is applied live by
  `utils/accent.ts` to `--zk-accent` and to on-canvas selection overlays via
  `engine/render/overlayColor.ts`.
- **`layers-panel.tsx`** — per-layer row with generated thumbnail
  (`useLayerThumbnail`, shared renderers at 3× then downscaled), visibility,
  lock, focus/solo, rename, duplicate, reorder, opacity (StrokeTrack), delete,
  clear, animation controls. `embedded` hides its own header (the studio panel
  shows `LayersActions` in its frame). Layer list is reversed (top = last).
- **`valut-view.tsx`** — vault gallery (grid/list, search, sort, rename, delete,
  storage usage, async thumbnail loading). *(Filename typo is load-bearing.)*
- **Phones**: there is no phone drawing UI. `draw-page.tsx` and
  `draw-by-id.tsx` redirect phones (`useIsMobile`) to `/`, where
  `vault-page.tsx` shows `no-mobile.tsx` ("Desktop & Tablet Only").

---

## 8. Services (`src/services/`)

- **`ExportService`** — `exportToPNG/JPG/SVG` (Infinite: content-fit into
  1920 x 1080 x scale) and `exportPage` / `renderPageToCanvas` (Fixed: exactly
  page W x H x scale, clipped to the page, strokes rendered at output
  resolution; scale capped by `exportScaleCap` to 16.7 MP / 8192 px a side).
  - PNG/JPG take `layers: IExportLayer[]` and render in z-order with the same
    per-draw-layer two-pass logic as the engine (strokes baked offscreen so
    eraser `destination-out` works, shapes vector on top). Stroke and shape
    rendering is delegated to the shared `engine/render` renderers +
    `brushRegistry`, so brushes and shape opacity now match the canvas. Export
    bounds include stroke `size`/shape `strokeWidth` and the offscreen bake is
    offset to the content bounds (handles negative coordinates). `imageCache` is
    cleared after each export.
  - SVG export is **hidden in the UI** (still strokes-only in the service) until
    shapes/images/eraser are supported.
  - `downloadFile(dataUrl, filename)` triggers the browser download.
- **`ThumbnailService`** — `generateThumbnailBlob(layers, background, w, h)`
  renders visible layers (strokes + shapes + images) to a PNG `Blob` (async
  `toBlob` encode). Draw layers
  are baked to an offscreen per layer (eraser isolation) using the shared
  `renderStroke`/`renderShape` renderers; grid uses `GridRenderer` (20px) for
  parity with the canvas/export. Renders at **3× then downscales** (supersampling)
  so thin strokes don't alias into dashes at thumbnail size.
- **`ImportService`** — file / URL / clipboard / dataURL → validated + processed
  blob via `ImageProcessingUtils` (`maxWidth/Height 4096`, 10MB compress
  threshold, SVG sanitization).
- **`ShareService`** — `storeSharedDrawing` (POST `/api/share/store`) and
  `retrieveSharedDrawing` (GET `/api/share/:id`), plus size checks (20MB).
- **`DexieService` / `BlobStorageService`** — storage (see §6).

---

## 9. Utilities (`src/utils/`)

- **`StrokeOptimizer`** — RDP (Ramer–Douglas–Peucker) simplification
  (`epsilon 0.5`) + coordinate/pressure truncation. Applied on save via
  `serializeLayers` to shrink stroke data.
- **`serializeLayers`** — maps MST layers to the save format from
  `getSnapshot`, caching each element's serialized/optimized output in a
  `WeakMap` keyed by its snapshot, so a save only processes new or changed
  elements. Used by canvas-view.
- **`ImageProcessingUtils`** — validate, resize, compress, SVG sanitize,
  dataURL↔blob.
- **`keyBindings`** — `KEY_BINDINGS` table + `KeyBindingManager`
  (register/handle). `useKeyboardShortcuts` wires these to store actions.

**Shortcuts summary**: Ctrl+Z/Y undo/redo · Ctrl+Backspace clear · Delete/Backspace
delete selection · V/1 select · 2 pen · 3 eraser · 4 pencil · 5 shapes ·
6 marker · 7 highlighter · 8 airbrush · 9 calligraphy ·
(shape mode) 1–4 shape kinds · Space pan · Ctrl +/-/0 zoom · Ctrl+F fit ·
Ctrl+S save · Ctrl+E export · Ctrl+N new · Ctrl+V vault · B/W/R colors ·
[/] brush size.

---

## 10. Routing & app shell (`src/pages/`, `src/page-components/`)

| Route | Astro page | React component |
|---|---|---|
| `/` | `pages/index.astro` (prerendered) | none: static landing page, vanilla TS in `src/landing/` |
| `/vault` | `pages/vault.astro` | `vault-page.tsx` → `VaultView` (or `NoMobile`) |
| any unknown path | `pages/404.astro` (prerendered) | static, reuses the landing pad |
| `/draw` | `pages/draw/index.astro` | `draw-pages/draw-page.tsx` → `CanvasView` |
| `/draw/[id]` | `pages/draw/[id].astro` (`prerender=false`) | `draw-pages/draw-by-id.tsx` → `CanvasView` |
| `/share` | `pages/share.astro` | `share-page.tsx` (legacy `?data=` links) |
| `/share/[shareId]` | `pages/share/[shareId].astro` | `share-by-id-page.tsx` (KV links) |
| `/api/share/store` | `pages/api/share/store.ts` | POST → writes KV w/ 30-day TTL |
| `/api/share/[shareId]` | `pages/api/share/[shareId].ts` | GET → reads KV |

`Layout.astro` wires global CSS, viewport (`user-scalable=no` unless the
`zoomable` prop is set, which the landing and 404 pages do), favicons, fonts
and SEO: props `pageTitle`, `description`, `canonicalPath`, `image`, `noindex`,
`jsonLd`, `zoomable`. It emits the canonical link (or `noindex` instead), Open Graph and X
card tags (image `/og/default.png`), and JSON-LD when given. Defaults come from
`SITE` in `src/config.ts`. The home page passes JSON-LD; `/draw/[id]` and the
share pages are `noindex`.

SEO files: `public/robots.txt`; `@astrojs/sitemap` (in `astro.config.mjs`,
`site: https://zketch.zerro.dev`) lists only `/` and `/draw`. `npm run
share-images` (`tools/build-share-images.ts`, runs as `predev` and `prebuild`)
renders `public/og/default.png` from `src/lib/og.ts` with `@resvg/resvg-js` and
the fonts in `src/assets/og/`, plus `favicon.ico` (16/32/48) and
`favicon-96.png` from `public/favicon.svg`. Those outputs are gitignored. It
runs with `node --experimental-strip-types` so it works on Node 22.

"Back to vault" in the app goes to `/vault`; the phone redirect from `/draw`
goes to `/` (the landing page works on phones, the app does not). The
new-drawing shortcut opens `/vault?new=1`.

### 10.1 Landing page (`src/landing/`)

Static HTML for all copy (h1 is the LCP element), with small `<script>`
modules per section. Only `engine/render/renderStroke`, the brush classes and
`engine/stamp` are imported, never MST, React, tiles or `CanvasEngine`
(about 29 KB gzip of JS loads with the page; `tests/landingBuild.test.ts`
guards 150 KB).

- `doodles/pen.ts`, `doodles/library.ts`: doodles made in code. A seeded
  `Pen` turns paths into real `StrokeLike`s with wobble, overshoot, pressure
  and `startTime`/`duration`. Outline strokes come first, then fills (ids end
  `-o#` / `-f#`, read by `strokeRole`). Long fills are chunked to 260 px so a
  partial redraw stays cheap. `make(seed, "watercolor")` repaints fills with
  watercolor. `autograph()` makes the brush-card signatures.
- `engine.ts`: a landing-only brush map (no Spray/Texture),
  `whenBrushesReady` (waits on `brushAssetsPending()` from
  `engine/stamp/assets.ts`), `warmGrain` (pencil paper noise in idle time).
- `DoodlePlayer.ts`: plays a doodle onto a canvas by slicing stroke points
  over time, caches finished strokes, bakes 3 "boil" frames by strip-warping
  the finished bitmap, and erases with a real eraser zig-zag.
- `ticker.ts`: one shared rAF loop (stops when nothing subscribes or the tab
  is hidden), `watchVisible`, reduced-motion check, and the draw-slot cap
  (2 doodles drawing or erasing at once; clicks bypass it).
- Light "paper" theme: doodles draw straight onto the page.
- `hero.ts`: 6 doodle spots (4 on phones) cycling draw → boil 8–15 s →
  erase → new doodle; click to swap. `pad.ts` + `handoff.ts`: the scribble pad
  with real brushes; "keep drawing" saves an `ISavedDrawingData` through
  `DexieService` and opens `/draw/<id>`. `vaultCount.ts` counts drawings with
  raw IndexedDB (never creates the database). `cards.ts`, `margins.ts`,
  `pens.ts` (two roaming pens that leave fading brush marks in empty space,
  pine trees on the CTA, button springs), `line.ts` (pencil line redrawn in
  real pixels and driven by scroll, with a pencil on its tip),
  `eggs.ts` (scribble over the headline, Konami → watercolor mode).
- `roller.ts`: the landing's own light/dark switch (header roller button),
  separate from the app theme. It sets `data-lp-theme` on `<html>` and stores
  it in `zketch-landing-theme`; first visits are always light (a pre-paint
  script in `index.astro` restores dark). The switch is a view transition:
  the new page is revealed through a per-frame `clip-path` of jittered roller
  bands (4 strokes, 3 on phones), with one missed spot the roller comes back
  to rub out, drawn on an overlay canvas named `lp-roller`. Esc or a second
  click skips it; no view transitions or reduced motion switch instantly.
  Dark tokens live under `html[data-lp-theme="dark"] .lp`; doodle canvases
  are inverted with a CSS filter.
- Everything pauses off-screen, and `prefers-reduced-motion` shows finished
  doodles with no cursors or boil. No sound anywhere, by design.
- `landing.css` overrides the global `canvas { touch-action: none }` inside
  `@layer base` so phones can scroll over doodles; only the pad captures touch.

---

## 11. Feature deep-dives (how the tricky parts work)

### 11.1 Selection & transform

- Selection is a list of `{layerId, elementId|null}` refs. `elementId:null`
  means "whole image layer".
- `selectionAnchor` is a persistent **rotated bbox** wrapping the selection.
  It is used for:
  - **any multi-selection**, and
  - **a single stroke** (strokes have no own `rotation` field).
  Single shapes/images use their own transform directly (anchor stays `null`).
- `TransformController` computes handle positions from the anchor (or the
  element). `drawing-canvas.tsx` captures a per-element snapshot
  (`groupTransformRef`) at drag start and applies per-point / per-element
  transforms each move. Group rotate rotates each stroke's points around the
  anchor center; group resize applies a uniform scale in the anchor's rotated
  frame. On pointer-up, `saveCurrentStateToHistory()`.
- `setActiveTool(non-select)` clears selection + anchor. `deselectLayer()` and
  `setInteractionMode("draw")` also clear.

### 11.2 Eraser

Three modes (`SettingsModel.eraserMode`; picked with `EraserModePicker` in the
bottom bar, the Simple card and Settings):

- **Whole elements (`element`, default)** — no eraser stroke is committed;
  anything the cursor touches on the active layer (strokes by segment distance,
  shapes and text by rotated box, arrows by curve distance) is added to
  `pendingEraserDeletes` → rendered at 25% alpha; on pointer-up
  `commitPendingErase()` splices them (one history entry).
- **Pixels (`pixel`)** — the eraser is committed as a stroke with
  `brushStyle:"eraser"`; `destination-out` cuts whatever lies under it on that
  layer, shapes included.
- **Smart (`smart`)** — the eraser stroke cuts brush strokes like Pixels, and
  shapes, arrows and free text it touches are fade-deleted whole.

The eraser preview stroke is suppressed in Whole elements mode (the fade is the
feedback). The circular cursor overlay is drawn only when
`activeTool==="brush" && currentBrushStyle==="eraser" && !space && !locked`.

### 11.3 Animation

`LayerAnimationControls` (in `layers-panel`) owns an
`AnimationPlaybackEngine`, feeds it the layer's stroke elements, and on each
frame calls back `canvas-view` → `drawing-canvas` → `engine.setAnimationState`,
which substitutes the animated strokes for that layer's content during render.
While animating, `canvasLocked` blocks all drawing/import.

### 11.4 Panel / performance notes

- Each layer gets its own offscreen canvas every frame (simple, correct, but
  O(layers) full re-render). `dirtyLayers` tracking exists but is currently
  unused for partial redraw.
- Preview strokes are RAF-coalesced in `drawing-canvas`.
- `renderVersion` bumps are microtask-batched to avoid N increments per action.

---

## 12. Known gotchas / conventions

1. **No comments in code** is the repo convention; keep changes self-explanatory.
2. **No lint/format** configured. Verify with `npx tsc --noEmit`, `npm test`
   (Vitest render tests), `npm run build`, and the browser (chrome-devtools
   tools are allow-listed in `.claude/settings.local.json`).
3. **`renderVersion` is auto-managed** — never `self.renderVersion++` manually;
   call `bumpRenderVersion` only if you must.
   Don't read `panX`/`panY`/`zoom`/`renderVersion` during `DrawingCanvas`
   render (including hook dependency arrays): it is an `observer`, so every
   pan frame would re-render it. Read them inside callbacks or MobX reactions.
4. **`saveToHistory()` is manual** — every mutating action must call it, or
   undo will skip the change.
5. **Erasers are strokes**, not geometry operations. The old geometry eraser
   actions (`eraseStrokes`, `splitStrokeByPoint`, …) are dead no-ops kept for
   compatibility.
6. **`texture` brush** was removed from all UI but remains in the enum +
   registry so old saved drawings still render.
7. **`valut-view.tsx`** (typo) is historical; do not "fix" the name without
   checking every import.
8. **MST detachment** — when reading layers inside engine callbacks / effects,
   use `getSnapshot(layer)` (as `drawing-canvas.getLayers` does) to avoid
   detached-node errors during reorder/merge.
9. **`wrangler.toml`, `CHANGELOG.md`, `docs/`, `.claude/`** are gitignored
   (local-only). The KV namespace binding is `ZKETCH_SHARES`.
10. **`interactionMode`** must stay in sync with whether there is a selection;
    helper actions generally maintain it.
11. Stroke save format is intentionally **optimized** (RDP) but the in-memory
    model keeps full points for smooth re-rendering.
12. Layer order: `layers[0]` is **bottom** in render order; the panel displays
    reversed (top layer first).
13. **Tiles**: anything that changes how an element renders must change the
    element (new snapshot) or go through the pending/hidden ids, otherwise its
    tiles stay stale. Add new per-element render state the same way.
    `renderBounds` must cover every painted pixel (test
    `renderBounds contains every painted pixel`).
14. **Autosave** skips when layers, background, active layer, name and page are
    unchanged (`lastSavedRef` in `canvas-view.tsx`), so pan/zoom never rewrites a
    drawing. New saved fields must be added to that signature.
15. **No lucide**: use `@/components/icons`. `src/components/icons/index.tsx`
    is generated; change drawings in `icons/defs/` and rerun `npm run icons`.

---

## 13. Where to make common changes

| Task | Touch |
|---|---|
| Add a brush | implement in `engine/brushes/*`, register in `BrushRegistry.registerDefaultBrushes()`, add the key to `BRUSH_STYLES` (`engine/types.ts`), set `category`, `strokeSettings` (and `strokeDefaults` if not neutral), run `npm run brushes:previews`. Export/thumbnail parity is automatic. |
| Add a shape kind | `ShapeLayerModel.ts` enum + factory, `CanvasModel` state, `CanvasEngine.tracePath`, `ExportService.traceShape`, `ThumbnailService.renderShape`, `layers-panel` thumbnail, dock picker |
| Change selection/transform behavior | `drawing-canvas.tsx` (group refs + handlers) + `CanvasModel` selection actions + `TransformController` |
| Change eraser behavior | `drawing-canvas.tsx` (pending scan), `CanvasEngine.renderStroke`, `CanvasModel.commitPendingErase`, `SettingsModel.eraserMode` |
| Persistence format change | `VaultModel` interfaces, `CanvasModel.loadLayers` migration, `canvas-view.performSave`, `DexieService` version bump |
| Export format/parity | `ExportService`, `ThumbnailService`, `export-dialog.tsx` |
| Keyboard shortcut | `utils/keyBindings.ts` + `hooks/useKeyboardShortcuts.ts` |
| Share/API | `services/ShareService.ts`, `pages/api/share/*`, `export-dialog.tsx` |
| Add or change a page preset | `PAGE_PRESETS` in `utils/page.ts` (and the tile spans in `NewDrawingDialog` `TILES`) |
| Add or change an icon | `icons/defs/*.mjs` (+ `icons/app.json` if the app uses it), then `npm run icons` |
| New studio panel | `components/studio/panels/` + `PanelId` and preset placement in `utils/dockLayout.ts` + `panels/index.ts` |

---

## 14. Docs index (in-repo)

- `README.md` — short product intro.
- `REFACTORING.md` — engine/layer/eraser refactor plan + phase status (mostly
  implemented: layered canvases, destination-out eraser, brush registry).
- `CHANGELOG.md` — "Unreleased" changelog for the old `layer-refactor` branch
  (selection, shapes, pending erase, auto-switch to select). Not updated since;
  later work is described in this file. *(gitignored/local.)*
- `todo.md` — early Shapes feature brainstorm (superseded by implemented
  shapes).
- `THIRD_PARTY_ASSETS.md` — sources and licences of bundled brush tips and
  grains (the share-image fonts carry their OFL files in `src/assets/og/`).
- `SHARING_MIGRATION.md`, `CLOUDFLARE_KV_SETUP.md` — share system + KV setup.
- `docs/superpowers/specs|plans/` — design specs for autosave/renderVersion,
  touch/stylus InputManager, and the sidebar floating-panel refactor. All three
  are implemented.
- `docs/report/` — unrelated academic report/synopsis PDFs + generation scripts.

---

## 15. Current status & roadmap

**Implemented & working:** layered engine with destination-out eraser, shared
renderers (canvas == export == thumbnails), brush registry with procedural,
stamp and RaV89 brushes, stylus pressure and stroke dynamics, pan/zoom,
touch/stylus/palm rejection, shapes + selection/transform, diagrams (bound
arrows, text, labels, hand-drawn looks), eraser modes, fixed-size pages,
autosave + renderVersion auto-bump, local vault + thumbnails, PNG/JPG export,
share via Cloudflare KV, per-layer timelapse animation, the studio drawing
screen (docks, layouts, Simple layout, Settings page), brush-drawn icons, the
swoosh logo, SEO tags and generated share images, tiled rendering (pan/zoom
never block on stroke rendering). Vitest render tests run with `npm test`.

**Known gaps / likely next work:**
- Deep zoom: zoom is clamped to 0.1..5 (`utils/zoom.ts`); finer scales need a
  save format without coarse truncation, camera-relative rendering and LOD.
- SVG export only handles strokes, so it is hidden in the export dialog.
- No polygon (n-sided) shape kind.
- Shape animation ("how shapes appear" during playback) is an open design question.
- No brush import (.abr / .brushset). The RaV89 pack licence forbids
  redistributing its files, so never add a brush export.
- Undo/redo history includes pan/zoom.
- Selection drag over dense content re-renders the affected tiles each move
  (~28 fps on 300 heavy strokes); lifting dragged elements out of tiles during a
  transform would fix it.
- Opening a heavy drawing spends ~1.2 s (dev) creating MST `Point` nodes; frozen
  point arrays would remove it (same saved format).
- Layer and vault thumbnails still re-render every stroke; they could be built
  from the overview tiles.

---

*Last updated 2026-10-19.*
