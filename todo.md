# Shapes Feature — Planning Notes

> Status: **Brainstorming in progress** — pick up from clarifying questions phase

## What We Decided

- **3-4 basic shapes**: Rectangle, Circle, Triangle/Polygon
- **Not premade strokes** — shapes are their own layer type (`ShapeLayer`) with geometric data, rendered via Canvas 2D path commands (`ctx.rect()`, `ctx.arc()`, `ctx.moveTo/lineTo`)
- **Click-and-drag creation** — select shape tool, drag on canvas to define size (like Figma)
- **Dock placement** — one "Shapes" icon in the floating dock, clicking it opens a secondary shape picker toolbar above the dock (like Figma's shape popover)
- **Side count** — polygon shape with adjustable sides (3=triangle, 4=square, 5=pentagon, etc.), controlled in the Tool Settings sidebar panel
- **Transform** — reuse existing `TransformController` for move/resize/rotate after creation

## Shape Properties (v1)

- Stroke color (uses current brush color from color picker)
- Stroke width (uses current brush size)
- Opacity (adjustable in Tool Settings panel)
- Side count (for polygon — adjustable in Tool Settings)
- **No fill for v1** — just outlines. Fill can be added later.

## Architecture Overview

### New Layer Type: ShapeLayer

Parallel to `StrokeLayer` and `ImageLayer`. Stores:

- Shape type: `"rectangle" | "circle" | "polygon"`
- Geometry: `x, y, width, height, rotation`
- Style: `color, strokeWidth, opacity`
- Polygon-specific: `sides` (number)

### Rendering

- Shapes render in `CanvasEngine.renderLayer()` alongside strokes and images
- Each shape drawn with Canvas 2D path commands (not freehand brush pipeline)
- Same pan/zoom transform pipeline as everything else

### UI Changes

- **Floating dock**: Add shape icon button after texture. Clicking opens shape picker popover above dock with rectangle/circle/polygon icons
- **Tool Settings panel**: When shape tool active, show shape-specific settings (stroke width, opacity, side count for polygon)
- **InputManager**: Shape creation uses click-drag interaction (pointerdown = start corner, pointermove = preview, pointerup = commit shape)

### Integration Points

1. `src/models/ShapeLayerModel.ts` — new MST model for shape data
2. `src/models/LayerModel.ts` — add ShapeLayer to union dispatcher
3. `src/engine/CanvasEngine.ts` — render shapes in layer pipeline
4. `src/components/floating-dock.tsx` — add shape tool button + picker popover
5. `src/components/sidebar/ToolSettingsPanel.tsx` — shape settings when shape tool active
6. `src/components/drawing-canvas.tsx` — shape creation drag interaction
7. `src/models/CanvasModel.ts` — shape tool state, addShape action

## Remaining Questions to Resolve

- [ ] Should each shape be its own layer, or should shapes live inside stroke layers?
- [ ] Shape preview while dragging — outline or filled preview?
- [ ] Should shapes snap to aspect ratio (hold Shift for perfect square/circle)?
- [ ] What happens when you select a placed shape? Transform handles immediately?
- [ ] Shape picker popover — does it auto-close after selecting a shape, or stay open?

## Next Steps

1. Finish brainstorming (resolve remaining questions above)
2. Write full design spec to `docs/superpowers/specs/`
3. Create implementation plan
4. Implement
