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
- Brushes: **Pen/Ink**, **Eraser**, **Spray** (a hidden legacy `texture` still
  exists in the model/registry for old saves).
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
| Icons | lucide-react + local `src/icons/*` |
| Hosting | Cloudflare Pages + KV (`ZKETCH_SHARES`) |
| Color picker | `@zzro/z-color-picker` |

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
│   ├── floating-dock.tsx      # Bottom tool dock (tools, shapes, zoom)
│   ├── layers-panel.tsx       # Right layers panel + per-layer thumbnails/animation
│   ├── export-dialog.tsx      # Export + share dialog
│   ├── import-dialog.tsx      # Image import (file/URL/drag)
│   ├── layer-animation-controls.tsx
│   ├── mobile-canvas-view.tsx / mobile-drawing-app.tsx / mobile-slider.tsx
│   ├── drawing-app.tsx / valut-view.tsx   (note: "valut" typo is intentional/baked in)
│   ├── sidebar/               # IconBar + draggable FloatingPanel + settings panels
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
│   ├── ImageProcessingUtils.ts# validate/resize/compress/sanitize images
│   ├── applyBrushPreset.ts    # Select a brush + apply its first preset
│   └── keyBindings.ts         # KEY_BINDINGS table + KeyBindingManager
│
├── hooks/            # useStores, useKeyboardShortcuts, useMobile, useCanvasResize
├── icons/            # Custom SVG components for the sidebar
├── pages/            # Astro routes (see §10)
├── page-components/  # React page shells mounted by Astro
├── layouts/Layout.astro
└── styles/global.css # Tailwind v4 theme + touch/zoom guards

tests/                # Vitest suites (Node + @napi-rs/canvas)
vitest.config.ts      # Test config (alias @ → src)
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
   - Layers are **cached**: a layer is re-baked only when its content
     (`config.getRenderVersion()`) or the view transform (pan/zoom) changes;
     otherwise the cached canvas is composited. So live preview frames do not
     re-bake committed strokes.
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
stored easing name to a function. `Brush` metadata is optional: `label?` (UI text)
and `defaults?: Partial<BrushOptions>` (per-brush fallback options consumed by
`createGetBrushOptions`, so a new brush usually doesn't need to touch
`brushOptions.ts`). Shared helpers: `easingFn` (`engine/easing.ts`) and
`seededRandom` (`engine/render/seededRandom.ts`). The registry exposes
`register/unregister/get/has/keys/all` and is re-exported from `engine/index.ts`.
**To add a brush**: implement `Brush { key; label?; defaults?; render(...) }` in
`src/engine/brushes/`, register it in `registerDefaultBrushes()`, add its key to
the `BrushStyle` union (`engine/types.ts`, `SharedModels.ts`, `CanvasModel.ts`,
`VaultModel.ts`), and add a dock icon/list entry. PNG/JPG/thumbnail parity is
automatic via the shared `renderStroke`. Spray exposes tunables
(`density/scatter/dotMin/dotRange`) through `BrushOptions` (defaults live on the
brush) and caps dots per stroke for bounded cost.

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
  `pendingEraserDeletes: Set<string>`.

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
thumbnail + image-blob cleanup, storage info, and orphan-blob cleanup. The
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
  ├─ useEffect[renderVersion] → engine.invalidate()
  ├─ useEffect[background|pan/zoom] → engine.setBackground/setPanZoom
  └─ useEffect[animatingLayerId] → engine.setAnimationState

canvas-view.tsx
  ├─ reaction(renderVersion) → debounce 500ms → performSave()   (autosave)
  ├─ beforeunload warns if isDirtyRef
  └─ performSave(): optimize strokes → ThumbnailService → BlobStorageService.storeThumbnail
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
- **`canvas-view.tsx`** — desktop editor shell. Floating header (name, save
  status, undo/redo/clear), `IconBar` + floating sidebar panels, `LayersPanel`,
  `FloatingDock`, export/import dialogs, autosave, animation playback state,
  canvas lock while animating.
- **`floating-dock.tsx`** — bottom dock: Pan, Select(1), a **Brush picker**
  (popover listing Pen/Marker/Highlighter/Airbrush/Calligraphy/Spray, shortcut
  numbers shown), Eraser(3), Shapes(5) + shape picker popover
  (rectangle/circle/diamond/triangle), zoom out / % / zoom in / fit. Selecting a
  brush applies its first `preset` (size/opacity/angle/softness) via
  `utils/applyBrushPreset`.
- **`layers-panel.tsx`** — per-layer row with generated thumbnail (via shared
  `renderStroke`/`renderShape`, rendered at 3× then downscaled), visibility, lock,
  focus/solo, rename, duplicate, reorder, opacity, delete, clear strokes, and
  expandable animation controls. Layer list is reversed (top = last).
- **`sidebar/`** — `index.tsx` (IconBar: Tool/Shape/Color/Background/TouchMode/
  Import/Export) + draggable `FloatingPanel` + panels:
  `ToolSettingsPanel` (live brush **preview** canvas + **Variants** chips from
  `Brush.presets` + per-brush controls: size/opacity, calligraphy nib angle,
  airbrush softness, pen thinning/smoothing/streamline/taper; eraser mode reactive),
  `ShapeSettingsPanel`
  (stroke width/opacity/corner radius/fill), `ColorPanel` (stroke/fill target),
  `BackgroundPanel`, `TouchModePanel`.
- **`valut-view.tsx`** — vault gallery (grid/list, search, sort, rename, delete,
  storage usage, async thumbnail loading). *(Filename typo is load-bearing.)*
- **Mobile**: `drawing-app.tsx` switches to `MobileDrawingApp` below 768px;
  mobile uses `mobile-canvas-view.tsx` (save/export, sheet sidebar) and
  `mobile-slider.tsx`. `vault-page.tsx` shows `no-mobile.tsx` instead of the
  vault on phones (inconsistent with `MobileDrawingApp`, which still renders
  `VaultView`).

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
- **`ThumbnailService`** — `generateThumbnailAsync(layers, background, w, h)`
  renders visible layers (strokes + shapes + images) to a data URL. Draw layers
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
  (`epsilon 0.5`) + coordinate/pressure truncation. Used on save (canvas-view &
  mobile-canvas-view) to shrink stroke data.
- **`ImageProcessingUtils`** — validate, resize, compress, SVG sanitize,
  dataURL↔blob.
- **`keyBindings`** — `KEY_BINDINGS` table + `KeyBindingManager`
  (register/handle). `useKeyboardShortcuts` wires these to store actions.

**Shortcuts summary**: Ctrl+Z/Y undo/redo · Ctrl+Backspace clear · Delete/Backspace
delete selection · V/1 select · 2 pen · 3 eraser · 4 spray · 5 shapes ·
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

`drawing-app.tsx` (used by `vault-page`? no — the Astro pages mount shells
directly; `drawing-app.tsx` is the legacy SPA shell kept for the vault↔canvas
toggle used by `MobileDrawingApp`) contains the mobile/desktop switch.

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

Two modes (Settings → `eraserWholeStroke`, shown in `ToolSettingsPanel`):

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

---

## 13. Where to make common changes

| Task | Touch |
|---|---|
| Add a brush | implement in `engine/brushes/*`, register in `BrushRegistry.registerDefaultBrushes()`, add the key to the `BrushStyle` union (`engine/types.ts` + the MST enums), add a dock icon/list entry. Export/thumbnail parity is automatic. |
| Add a shape kind | `ShapeLayerModel.ts` enum + factory, `CanvasModel` state, `CanvasEngine.tracePath`, `ExportService.traceShape`, `ThumbnailService.renderShape`, `layers-panel` thumbnail, dock picker |
| Change selection/transform behavior | `drawing-canvas.tsx` (group refs + handlers) + `CanvasModel` selection actions + `TransformController` |
| Change eraser behavior | `drawing-canvas.tsx` (pending scan), `CanvasEngine.renderStroke`, `CanvasModel.commitPendingErase`, `SettingsModel.eraserWholeStroke` |
| Persistence format change | `VaultModel` interfaces, `CanvasModel.loadLayers` migration, `canvas-view.performSave`, `DexieService` version bump |
| Export format/parity | `ExportService`, `ThumbnailService`, `export-dialog.tsx` |
| Keyboard shortcut | `utils/keyBindings.ts` + `hooks/useKeyboardShortcuts.ts` |
| Share/API | `services/ShareService.ts`, `pages/api/share/*`, `export-dialog.tsx` |
| New sidebar panel | `components/sidebar/` + wire into `canvas-view.tsx` + `sidebar/index.tsx` |

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
- `mobile-canvas-view` exists but the vault page blocks mobile; inconsistent.
- No automated tests; performance relies on full per-layer redraws.
- Layer `dirtyLayers` tracking is scaffolded but unused.

---

*Last updated after a full read of the repo (engine, brushes, models, services,
components, pages, and docs).*
