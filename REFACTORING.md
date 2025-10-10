# Canvas Engine Refactor Plan

This document outlines a focused plan to simplify erasing, preserve the grid, and make brushes modular and maintainable.

## Objectives

- Simplify erasing: no stroke-splitting; use canvas compositing (destination-out).
- Preserve background/grid: erasing never touches grid or background.
- Modular brush system: add brushes by registering implementations.
- Separate rendering from React component logic.
- Fix eraser cursor lingering when switching to pan/not-draw.
- Keep undo/redo as-is (eraser is just a stroke with a different composite mode).

## Architecture overview (layers)

- Background canvas (layer 0)
  - Renders: white or grid (in world coordinates) based on background setting.
- Strokes canvas (layer 1)
  - Renders: all strokes in order; eraser strokes using `globalCompositeOperation = 'destination-out'`.
- Optional overlay (layer 2)
  - Renders UI-only elements (e.g., eraser circle cursor). No hit-test or export.

Compositing rules:

- Normal brushes: `source-over` (default).
- Eraser brush: `destination-out` (punches holes in strokes layer only).
- Background is independent, never erased.

## Modules

Create `src/engine/` with:

- `types.ts` — Point, StrokeLike, BrushStyle, BrushOptions, Brush, EngineConfig, PanZoom.
- `CanvasEngine.ts` — manages canvases, pan/zoom, render loop, invalidation, compositing, preview stroke.
- `GridRenderer.ts` — world-space grid renderer honoring pan/zoom.
- `brushes/`
  - `FreehandBrush.ts` — perfect-freehand outline brush.
  - `SprayBrush.ts` — dot scatter brush.
  - `TextureBrush.ts` — layered/noisy outline brush.
- `index.ts` — barrel exports.

## Engine API (TypeScript)

- constructor(root: HTMLElement, config: { background, getStrokes, onInvalidate? })
- setPanZoom({ panX, panY, zoom }): void
- setBackground(bg): void
- setPreviewStroke(stroke | null): void
- invalidate(): void
- destroy(): void

Brush interface:

- key: BrushStyle
- render(ctx, stroke, options?): void

Notes:

- Eraser uses the Freehand path but engine switches composite op to `destination-out`.
- Engine renders in world space: applies translate(panX, panY) and scale(zoom) once per frame.

## React integration (component refactor)

- Replace `DrawingCanvas`’s single <canvas> with a root <div> that the engine mounts two canvases into.
- Keep pointer/keyboard logic in React but delegate drawing to engine via:
  - building a temporary preview stroke from `currentPoints` → `engine.setPreviewStroke()`
  - adding final stroke to MST store on pointer up (including eraser strokes)
- Pan/zoom updates → `engine.setPanZoom()`.
- Background changes → `engine.setBackground()`.
- Cursor overlay: CSS/SVG in component, visible only when:
  - isDrawingMode is true
  - currentBrushStyle === 'eraser'
  - not panning and Space not held

## Eraser behavior

- Model eraser as strokes with `brushStyle: 'eraser'` and size = eraserSize.
- Engine renders them with `destination-out`. No store mutation or geometry splitting.
- Undo/redo naturally works.

## Export behavior updates

- PNG/JPG export should mirror on-screen compositing:
  - Render strokes on a canvas; set `destination-out` for eraser strokes.
  - If background === 'grid', render grid on a separate background canvas (or same export canvas before strokes).
  - Respect transparent export option; only paint background if not transparent.
- SVG export: keep as-is for now (no native dest-out); optionally skip eraser strokes or approximate later. Mark as follow-up.

## Current status

Done:

- Layered canvases (background, strokes, UI overlay) with DPR-aware resize.
- Eraser via `destination-out` compositing on strokes layer (grid/background preserved).
- React component mounts engine; preview stroke + eraser cursor overlay.
- Pan/zoom unified (screen = zoom × world + pan), correct wheel focal zoom.
- Undo/redo immediate via engine invalidation on `renderVersion`.
- Export/Thumbnail parity: apply same compositing (eraser cuts strokes only).

Notes:

- Legacy migration and in-app vault reset helpers were removed. To start fresh in dev, clear site data.
- Folder naming gotcha fixed (avoid `.tsx` in folder names for Vite dynamic imports).

## Phased rollout

1. Core engine + layering

- Scaffold engine and switch on-screen rendering to layered canvases.
- Keep existing pointer logic; start adding eraser strokes instead of splitting.
- Fix eraser cursor lingering (overlay visibility rules).

Phase 1 checklist:

- [x] Convert eraser to destination-out compositing (no stroke splitting).
- [x] Draw background/grid in separate layer so it’s never erased.
- [x] Keep undo/redo intact (eraser as stroke).
- [x] Hide eraser cursor when not drawing or while panning/space.
- [x] Engine scaffold with layered canvases.

2. Brush registry & cleanup

- Move current spray/texture rendering into `brushes/`.
- Remove store.eraseStrokes and related helpers.
- Small perf pass (requestAnimationFrame loop, invalidation on changes).

3. Export parity & perf

- Update ExportService to use the same compositing logic for PNG/JPG.
- Throttle pointer sampling; pool Path2D; consider OffscreenCanvas for heavy brushes.
- Add basic tests/smoke checks.

4. New brushes (pressure/opacity etc.)

- Pressure-sensitive opacity brush (alpha from pressure with min/max clamp).
- Pressure-sensitive size brush (size curve; e.g., quadratic or cubic mapping).
- Calligraphy/tilt brush (elliptical nib, angle control; simulate with rotated strokes).
- Pencil/graphite brush (texture + multiply-like effect via low alpha stacking).
- Highlighter (semi-transparent color with blend-like appearance over strokes).
- Brush options UI: per-brush settings stored in MST and passed to engine.

5. Image imports (background and layer)

- Allow importing raster images as drawable layers on the strokes canvas layer stack (but rendered beneath strokes by z-order).
- Transform (position/scale/rotate) with handles in overlay; persist as a special stroke type: { kind: 'image', src, transform }.
- Export: bake images into PNG/JPG; for SVG, embed data URI or skip for v1.

6. Selection tool (last phase)

- Marquee/lasso selection drawn on overlay; hit-test strokes in world space.
- Maintain selection set; show bounding box + handles on overlay.
- Ops: move, scale, rotate (apply affine to stroke points); delete/duplicate.
- Undo/redo integrated as grouped operations.

## Acceptance criteria

- Erasing never removes grid/background.
- Undo/redo includes eraser strokes.
- Pan/zoom works identically.
- Eraser cursor never shows when not in drawing mode or when panning/space.
- Exports (PNG/JPG) visually match the canvas for typical drawings.
- New brushes demonstrate pressure-size and pressure-opacity behavior.
- Image import can render, transform, and export with drawings.
- Selection can select multiple strokes and transform them reliably (phase 6).

## Risks & rollback

- If performance regresses, temporarily disable preview stroke.
- If export parity lags, ship engine first and gate export changes behind a flag.
- Rollback by switching component back to single-canvas render (kept behind a feature flag during development).

## Next brushes / future work

- Pattern/texture libraries, blend modes per brush, pressure curves per brush.
- Selection/transform tools on a separate overlay.
- Hit-testing quadtree for stroke selection.
- Brush preview thumbnails and real-time settings panel.
- Blend modes per-stroke when moving to WebGL (future).

## Tools (Floater) engines

- Each tool/brush maps to a brush engine implementing `Brush`.
- Floater toggles set current brush and options in the store; engine reads and renders accordingly.
- New brushes are added by registering a new brush implementation and wiring UI controls.

---

Implementation started with engine scaffolding and swapping `DrawingCanvas` to mount it; geometry-based eraser has been removed in favor of compositing.

## Next steps (short)

- Tweak preview performance thresholds (min-distance, RAF cadence).
- Pressure-based opacity/size brush variant.
- Image import layer under strokes.
- Selection/move tool groundwork (overlay handles, hit-testing).
