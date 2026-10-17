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
- Multi-layer canvas (draw layers mix strokes + shapes; image layers hold
  imported rasters).
- Selection / move / resize / rotate (single + multi-select, marquee, anchor bbox).
- Undo / redo, eraser (pixel + whole-stroke/object modes).
- Local vault (Dexie/IndexedDB), PNG/JPG/SVG export, image import, share links.
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
│   ├── brushOptions.ts        # Builds per-brush BrushOptions from settings
│   ├── easing.ts             # Easing-name → fn resolver (shared by brushes + options)
│   ├── types.ts              # All engine contracts (StrokeLike, LayerLike, Brush…)
│   ├── index.ts              # Barrel exports
│   ├── render/               # Shared renderers + brush registry (canvas/export/thumb)
│   │   ├── BrushRegistry.ts   # Brush map + shared singleton + registerDefaultBrushes()
│   │   ├── renderStroke.ts    # Eraser-aware stroke renderer (composite-safe)
│   │   ├── renderShape.ts     # Shape renderer (applies element opacity/rotation)
│   │   ├── shapePaths.ts      # ONE copy of rect/circle/diamond/triangle paths
│   │   ├── renderImage.ts     # Image layer draw with rotation
│   │   ├── seededRandom.ts    # Deterministic RNG shared by brushes
│   │   ├── pathData.ts        # perfect-freehand outline → SVG path string
│   │   ├── color.ts           # hex → rgba helper (airbrush gradients)
│   │   └── index.ts
│   └── brushes/
│       ├── FreehandBrush.ts   # key "ink" — perfect-freehand outline
│       ├── MarkerBrush.ts     # key "marker" — flat, multiply build-up
│       ├── HighlighterBrush.ts# key "highlighter" — wide translucent multiply
│       ├── AirbrushBrush.ts   # key "airbrush" — soft radial-gradient build-up
│       ├── CalligraphyBrush.ts# key "calligraphy" — angle-dependent nib ribbon
│       ├── SprayBrush.ts      # key "spray" — seeded dot scatter
│       └── TextureBrush.ts    # key "texture" — layered noisy outline (hidden)
│
├── models/          # MST data models
│   ├── CanvasModel.ts         # THE central model: layers, tools, selection, history
│   ├── LayerModel.ts          # DrawLayer + ImageLayer union + Element union
│   ├── ShapeLayerModel.ts     # ShapeElement (data only)
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
│   ├── layers-panel.tsx       # Right layers panel + per-layer thumbnails/animation
│   ├── export-dialog.tsx      # Export + share dialog (preview pane + options column)
│   ├── share/ShareViewer.tsx  # Shared viewer for /share and /share/[id] (pages only load data)
│   ├── import-dialog.tsx      # Image import (file/URL/drag)
│   ├── layer-animation-controls.tsx
│   ├── valut-view.tsx         (note: "valut" typo is intentional/baked in)
│   ├── studio/                # drawing-screen shell, bottom bar, docks, panels, StrokeTrack
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
│   └── keyBindings.ts         # KEY_BINDINGS table + KeyBindingManager
│
├── hooks/            # useStores, useKeyboardShortcuts, useMobile, useCanvasResize
├── pages/            # Astro routes (see §10)
├── page-components/  # React page shells mounted by Astro
├── layouts/Layout.astro
└── styles/global.css # Tailwind v4 theme + touch/zoom guards

tests/                # Vitest suites (Node + @napi-rs/canvas)
vitest.config.ts      # Test config (alias @ → src)
icons/                # Removable icon pack: defs/, lib/, build.mjs, svg/, sprite.svg, gallery.html
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
   - Else, for each **visible** layer: render it into its own **offscreen
     canvas** (`getLayerContext`), then composite onto `display` with
     `globalAlpha = layer.opacity`.
   - Layer canvases are device-pixel sized plus a 256 CSS-px **overscan**
     margin on every side. Bakes use an explicit
     `setTransform(dpr*zoom, dpr*(pan+margin))`; compositing is done 1:1 in
     device pixels (identity transform, then the view delta).
   - Layers are **cached** per layer (`layerBakes`: content key, pending-erase
     set, and the view it was baked at). The content key is the layer's
     `elements` snapshot array (MST snapshots are structurally shared, so it
     keeps its identity until that layer changes) or, for image layers, a
     string of blob/geometry/loaded state. A layer re-bakes only when its own
     key or the pending-erase set changes, or it is animating. If exactly one
     element was appended (same view, prefix identical, and not a stroke
     landing under existing shapes), only that element is drawn onto the
     cached canvas. When only the view changes, the cached bitmap is composited with the view delta while
     a gesture is in progress (view changed < 150 ms ago) and the bitmap still
     covers the viewport (scale delta 0.5–3×); a crisp re-bake runs once the
     gesture settles (`settleTimer`) or coverage runs out. Live preview frames
     never re-bake committed strokes.
   - Preview stroke (`setPreviewStroke`) and preview shape (`setPreviewShape`)
     are drawn last, on top.
3. `renderOverlay()` — selection outlines, transform handles, marquee, and the
   eraser circle cursor.

`renderLayer()` for a **draw layer** does a two-pass bake:
1. All **strokes** first (raster). Eraser strokes switch the context to
   `globalCompositeOperation = "destination-out"` so they punch holes in that
   layer only.
2. All **shape elements** afterwards as vectors (`renderShape` + `traceShape` from
   `engine/render/`, supporting rounded rect / ellipse / diamond / triangle).

> **Key rule:** erasers are just strokes with `brushStyle: "eraser"`. The engine
> renders them with the `ink` brush but forces `taperStart/End = 0` and
> `opacity = 1` so short strokes still leave a hole. Undo/redo needs no special
> casing because they are normal history entries.

Image layers: `renderImageLayer` loads the blob via `BlobStorageService.getBlobUrl`,
caches the `HTMLImageElement`, and draws with rotation around center.

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
fit so saved strokes render unchanged), `flip` (random mirror), and optional
paper `grain` (`{id, scale, depth}`).

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
seek, speed (0.5/1/2/4), loop, partial strokes for progressive draw-on, and
emits `onFrame(info, visibleStrokes)`. Shapes are not animated (they stay static).

---

## 5. Data models (`src/models/`)

### 5.1 Layer model (`LayerModel.ts`)

- `Element` MST union dispatches by presence of `shapeType` → `ShapeElement`,
  else `Stroke`.
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

### 5.3 `VaultModel.ts`

Holds `SavedDrawing[]` persisted in Dexie (`DrawingVault` DB, table `drawings`).
`layers` are stored as **frozen JSON** (`ILayerData[]`, supporting legacy
`stroke`/`shape` + new `draw`/`image`). Handles add/delete/rename/update,
thumbnail + image-blob cleanup, storage info, and orphan-blob cleanup. Writes
are per drawing (`persistDrawing(id)` → `DexieService.saveDrawing`), never the
whole vault. The
on-disk snapshot interfaces live here (`IStrokeData`, `IShapeElementData`,
`IDrawLayerData`, `IImageLayerData`, `IShapeLayerData`, `ISavedDrawingData`).

### 5.4 `SettingsModel.ts`

Persisted to `localStorage` key `drawing-app-settings`: defaults (pen size,
brush, color, background), export settings (format/quality/transparent/scale),
UI prefs (autoHideDock/delay/showGrid/snapToGrid), `touchMode`,
`eraserWholeStroke`.

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
  - `StudioShell` — canvas viewport between the left/right docks, over the
    bottom deck and bar. Desktop (≥1100 px): docks reserve space and the view is
    pan-compensated when the viewport's left edge moves; below 1100 px docks
    overlay the canvas and close on pointer-down on `[data-canvas-root]`.
    Shows the layers strip when the Layers dock is closed and reopen tabs for
    closed sidebars.
  - `TopLeftBlock` (Z menu: rename, vault, import, export, background, touch &
    stylus, layout, clear; name input; save status), `TopRightBlock` (undo,
    redo, Share → export dialog).
  - `BottomBar` — tools (select, draw, erase, shapes, pan), tool-dependent area
    (brush chip + Size/Opacity, eraser size + whole-stroke mode, shape kinds +
    stroke; empty for Select and Pan), colour + swatches, zoom/fit, deck toggle. In the Minimal layout
    the brush chip opens a popover (brush grid + presets).
  - `DockArea` (one per dock; drag-and-drop target with drop line),
    `PanelFrame` (grip, title, collapse, dock-left/bottom/right buttons;
    `PanelVariantContext` = deck | side | popover), `panels/` (Brushes,
    Presets, Stroke, Colour with `HsvPicker`, Layers + `LayersStrip`, Shapes;
    registry in `panels/index.ts`).
  - `StrokeTrack` — the only slider style for app settings: a picture of the
    setting (`trackShapes.ts`: size wedge, opacity checkerboard, stabilizer
    wobble, width variation, taper, flat), notch knob, value tag, keyboard,
    double-click to type, `role="slider"`.
  - Dock state: `utils/dockLayout.ts` (panel → dock/order/collapsed, dock
    open flags, layout bottom | sidebars | minimal | custom; localStorage
    `zketch-dock-layout-v1`, bad data falls back to Bottom deck).
- **Dock motion and dragging**: `studio/DockSlot.tsx` animates each dock's
  width/height (200 ms) and unmounts it after closing; pan compensation runs
  every frame through the viewport ResizeObserver, so the drawing stays put.
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
- **Vault** (`valut-view.tsx`): studio chrome; grid/list choice in
  localStorage `zketch-vault-view`; delete goes through a confirm dialog;
  Settings opens the same `SettingsPage`.
- **`studio/SettingsPage.tsx`** — full-page Settings over the studio (Z menu →
  Settings, Esc closes; key events stop at the page so drawing shortcuts don't
  fire): Appearance (5 accents + custom HSV, live preview), Layout (3 layouts +
  reset), Canvas (default background for new drawings, applied in
  `canvas-view` when a new drawing starts), Drawing (touch & stylus mode,
  eraser mode), Shortcuts (from `KEY_BINDINGS`, one row per action).
- **Icons**: every icon comes from `components/icons` (`<PencilIcon className="h-[18px] w-[18px]" />`;
  `size`, `className`, `aria-label`; stroke width is fixed, so no `strokeWidth`).
  The components are generated by `npm run icons` from the drawings in the
  repo-root `icons/` pack (centreline definitions in `icons/defs/*.mjs`, style
  rules in `icons/README.md`). The app never imports from `icons/`; the pack can
  be deleted without breaking the build. To add an icon to the app: draw it in
  `icons/defs/`, add its name to `icons/app.json`, run `npm run icons`.
- **Tokens and accent**: `styles/global.css` defines `--zk-*` colours (Tailwind
  `bg-zk-surface`, `text-zk-muted`, `bg-zk-accent`, …) and `font-display`
  (Fraunces) / `font-ui` (Instrument Sans); shadcn variables map onto them.
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

- **`ExportService`** — `exportToPNG/JPG/SVG`.
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
| `/` | `pages/index.astro` | `vault-page.tsx` → `VaultView` (or `NoMobile`) |
| `/vault` | `pages/vault.astro` | `VaultPage` |
| `/draw` | `pages/draw/index.astro` | `draw-pages/draw-page.tsx` → `CanvasView` |
| `/draw/[id]` | `pages/draw/[id].astro` (`prerender=false`) | `draw-pages/draw-by-id.tsx` → `CanvasView` |
| `/share` | `pages/share.astro` | `share-page.tsx` (legacy `?data=` links) |
| `/share/[shareId]` | `pages/share/[shareId].astro` | `share-by-id-page.tsx` (KV links) |
| `/api/share/store` | `pages/api/share/store.ts` | POST → writes KV w/ 30-day TTL |
| `/api/share/[shareId]` | `pages/api/share/[shareId].ts` | GET → reads KV |

`Layout.astro` wires global CSS, viewport (`user-scalable=no`), favicon.

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

Two modes (Settings → `eraserWholeStroke`, toggled in the bottom bar while erasing):

- **Pixel (default, off)** — eraser is committed as a stroke with
  `brushStyle:"eraser"`; engine renders it `destination-out` on the layer.
  Shapes and (in whole-stroke mode) strokes the circular cursor passes over are
  added to `pendingEraserDeletes` → rendered at 25% alpha; on pointer-up
  `commitPendingErase()` splices them (one history entry). Note: even in pixel
  mode, **shapes** are fade-deleted (they aren't erased by destination-out).
- **Whole-stroke (on)** — no eraser stroke is committed; everything hovered
  fades and is deleted on release.

The eraser preview stroke is suppressed in whole-stroke mode (the fade is the
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
2. **No tests/lint/format** configured. Verify with `npx tsc --noEmit` and the
   browser (chrome-devtools tools are allow-listed in `.claude/settings.local.json`).
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
13. **No lucide**: use `@/components/icons`. `src/components/icons/index.tsx`
    is generated; change drawings in `icons/defs/` and rerun `npm run icons`.

---

## 13. Where to make common changes

| Task | Touch |
|---|---|
| Add a brush | implement in `engine/brushes/*`, register in `BrushRegistry.registerDefaultBrushes()`, add the key to `BRUSH_STYLES` (`engine/types.ts`), set `category`, `strokeSettings` (and `strokeDefaults` if not neutral), run `npm run brushes:previews`. Export/thumbnail parity is automatic. |
| Add a shape kind | `ShapeLayerModel.ts` enum + factory, `CanvasModel` state, `CanvasEngine.tracePath`, `ExportService.traceShape`, `ThumbnailService.renderShape`, `layers-panel` thumbnail, dock picker |
| Change selection/transform behavior | `drawing-canvas.tsx` (group refs + handlers) + `CanvasModel` selection actions + `TransformController` |
| Change eraser behavior | `drawing-canvas.tsx` (pending scan), `CanvasEngine.renderStroke`, `CanvasModel.commitPendingErase`, `SettingsModel.eraserWholeStroke` |
| Persistence format change | `VaultModel` interfaces, `CanvasModel.loadLayers` migration, `canvas-view.performSave`, `DexieService` version bump |
| Export format/parity | `ExportService`, `ThumbnailService`, `export-dialog.tsx` |
| Keyboard shortcut | `utils/keyBindings.ts` + `hooks/useKeyboardShortcuts.ts` |
| Share/API | `services/ShareService.ts`, `pages/api/share/*`, `export-dialog.tsx` |
| Add or change an icon | `icons/defs/*.mjs` (+ `icons/app.json` if the app uses it), then `npm run icons` |
| New studio panel | `components/studio/panels/` + `PanelId` and preset placement in `utils/dockLayout.ts` + `panels/index.ts` |

---

## 14. Docs index (in-repo)

- `README.md` — short product intro.
- `REFACTORING.md` — engine/layer/eraser refactor plan + phase status (mostly
  implemented: layered canvases, destination-out eraser, brush registry).
- `CHANGELOG.md` — detailed "Unreleased" changelog for the `layer-refactor`
  branch; the single best description of recent behavior (selection, shapes,
  pending erase, auto-switch to select, etc.). *(gitignored/local.)*
- `todo.md` — early Shapes feature brainstorm (superseded by implemented
  shapes; still lists open questions).
- `SHARING_MIGRATION.md`, `CLOUDFLARE_KV_SETUP.md` — share system + KV setup.
- `docs/superpowers/specs|plans/` — design specs for autosave/renderVersion,
  touch/stylus InputManager, and the sidebar floating-panel refactor. All three
  are implemented.
- `docs/report/` — unrelated academic report/synopsis PDFs + generation scripts.

---

## 15. Current status & roadmap

**Implemented & working:** layered engine with destination-out eraser, brush
registry, pan/zoom, touch/stylus/palm rejection, shapes + selection/transform,
autosave + renderVersion auto-bump, local vault + thumbnails, PNG/JPG export,
SVG export (strokes only), share via Cloudflare KV, per-layer timelapse
animation, sidebar floating panels.

**Known gaps / likely next work:**
- SVG export ignores shapes, images, and erasers.
- No polygon (n-sided) shape kind (deferred to v2).
- No text element type.
- Shape animation ("how shapes appear") is an open design question.
- Selection avatar for shape config is partially duplicated between
  `CanvasModel` shape-tool state and `ShapeSettingsPanel`.
- No automated tests; performance relies on full per-layer redraws.
- Layer `dirtyLayers` tracking is scaffolded but unused.

---

*Last updated after a full read of the repo (engine, brushes, models, services,
components, pages, and docs).*
