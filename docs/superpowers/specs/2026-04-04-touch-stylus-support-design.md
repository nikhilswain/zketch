# Touch & Stylus Support — Design Spec

## Problem

The current pointer handling in `drawing-canvas.tsx` treats every `PointerEvent` as a drawing action. On touch devices:

- Two-finger pinch creates two simultaneous strokes instead of zooming
- No pinch-to-zoom or two-finger pan gesture support
- No separation between pen (stylus) and finger input
- No palm rejection when using a stylus
- All pointer logic is inline in a 1000-line React component

## Solution

Create an `InputManager` engine class that tracks all active pointers, classifies user intent, recognizes gestures, and emits high-level events. Refactor `drawing-canvas.tsx` to subscribe to these events instead of handling raw pointers.

## Architecture

### New file: `src/engine/InputManager.ts`

A standalone TypeScript class (no React dependency) following the same pattern as `TransformController` and `AnimationPlaybackEngine`.

#### Pointer Tracking

```typescript
interface TrackedPointer {
  id: number;
  type: "mouse" | "pen" | "touch";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  isPrimary: boolean;
}

// Internal state
activePointers: Map<number, TrackedPointer>
```

The manager attaches `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and `pointerleave` listeners to a provided root element. All listeners use `{ passive: false }` to allow `preventDefault()`.

`pointercancel` (browser interrupts touch, e.g., incoming call) and `pointerleave` are treated the same as `pointerup` — if drawing, commit the stroke with current points; if gesturing, end the gesture. The tracked pointer is removed from the map.

#### Touch Mode

Three modes, controlled by a setting:

| Mode | Description |
|---|---|
| `auto` | Pen draws. Single finger draws. Two+ fingers gesture. |
| `stylus-only` | Only pen draws. All finger input is gesture/pan. |
| `touch-draw` | Single finger draws. Two+ fingers gesture. Same as auto but without pen distinction. |

The mode is read via a getter callback passed at construction time: `getTouchMode: () => TouchMode`.

#### Intent Classification

Runs on every `pointerdown` and `pointermove`:

| Touch Mode | pointerType | Active touch count | Intent |
|---|---|---|---|
| auto | `"pen"` | any | `draw` |
| auto | `"touch"` | 1 | `draw` |
| auto | `"touch"` | 2+ | `gesture` |
| auto | `"mouse"` | any | `draw` (existing behavior) |
| stylus-only | `"pen"` | any | `draw` |
| stylus-only | `"touch"` | 1 | `gesture` (single-finger pan) |
| stylus-only | `"touch"` | 2+ | `gesture` |
| stylus-only | `"mouse"` | any | `draw` |
| touch-draw | `"touch"` | 1 | `draw` |
| touch-draw | `"touch"` | 2+ | `gesture` |
| touch-draw | `"pen"` | any | `draw` |
| touch-draw | `"mouse"` | any | `draw` |

#### Mid-Stroke Cancellation

If a user starts drawing with one finger and then places a second finger:

1. Emit `draw:cancel` — the in-progress stroke is discarded
2. Switch to gesture mode using both finger positions as the gesture start state
3. Begin emitting `gesture:update` events

This transition must be seamless with no leftover preview stroke.

#### Events (Callback-Based)

```typescript
interface InputManagerCallbacks {
  onDrawStart?: (point: { x: number; y: number; pressure: number }, pointerType: string) => void;
  onDrawMove?: (point: { x: number; y: number; pressure: number }) => void;
  onDrawEnd?: () => void;
  onDrawCancel?: () => void;
  onGestureStart?: () => void;
  onGestureUpdate?: (gesture: {
    panDeltaX: number;
    panDeltaY: number;
    zoomDelta: number;       // ratio: >1 zoom in, <1 zoom out, 1 no change
    zoomCenterX: number;     // screen coordinates
    zoomCenterY: number;
  }) => void;
  onGestureEnd?: () => void;
  onHoverMove?: (screenX: number, screenY: number) => void;
}
```

Same callback pattern as `AnimationPlaybackEngine` — callbacks passed at construction or via `setCallbacks()`.

### Gesture Recognition

#### Pinch-to-Zoom + Two-Finger Pan (Combined)

When 2 touch pointers are active, on every `pointermove`:

```
previous frame:  center = (cx0, cy0),  distance = d0
current frame:   center = (cx1, cy1),  distance = d1

panDeltaX    = cx1 - cx0
panDeltaY    = cy1 - cy0
zoomDelta    = d1 / d0
zoomCenterX  = cx1    (screen coords)
zoomCenterY  = cy1    (screen coords)
```

Pan and zoom are always combined into a single `gesture:update` event. On real devices, users never pinch without moving the center point — splitting them causes jitter.

#### Gesture Start Threshold

Don't immediately switch to gesture mode when a second finger lands. Wait for either:

- Both fingers have moved > 5px from their start positions, OR
- 50ms have passed with both fingers still down

This prevents false gesture triggers when two fingers land with slight time offset.

#### Single-Finger Pan (Stylus-Only Mode)

In `stylus-only` mode, a single `touch` pointer emits gesture events instead of draw events. The gesture is pure pan (no zoom):

```
panDeltaX = currentX - previousX
panDeltaY = currentY - previousY
zoomDelta = 1  (no zoom change)
```

### Palm Rejection

**Phase 1 (this spec):** When a `pen` pointer is actively drawing (`penActive` flag), all `touch` pointer events are classified as `ignore` — they don't draw and don't trigger gestures. This matches iPadOS native behavior.

**Deferred:** Touch-size heuristic using `PointerEvent.width` / `PointerEvent.height` (unreliable across devices, not worth the complexity now).

### Integration with drawing-canvas.tsx

#### What moves to InputManager:

- All raw `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerLeave` handler logic
- `isPanning` / `lastPanPoint` state (gestures are now InputManager's responsibility)
- `spacePressed` pan override (InputManager accepts a `setPanOverride(boolean)` method)
- Multi-touch prevention code (`handleTouchStart`, `handleGestureStart` listeners)

#### What stays in drawing-canvas.tsx:

- `CanvasEngine` mounting and syncing (unchanged)
- Transform mode / image hit testing — InputManager's `onDrawStart` callback checks for transform handles before starting a stroke
- Preview stroke rendering — reacts to `currentPoints` state as before
- Eraser cursor overlay — reacts to `onHoverMove`
- Mouse wheel zoom+pan — `handleWheel` stays, it's a separate input path that already works

#### Subscription pattern in drawing-canvas.tsx:

```typescript
useEffect(() => {
  const root = rootRef.current;
  if (!root) return;

  const inputManager = new InputManager(root, {
    getTouchMode: () => settingsStore.touchMode,
    getIsDrawingMode: () => isDrawingMode,
    callbacks: {
      onDrawStart: (pt, pointerType) => { /* set drawing state */ },
      onDrawMove: (pt) => { /* append point */ },
      onDrawEnd: () => { /* commit stroke to canvasStore */ },
      onDrawCancel: () => { /* clear points, clear preview */ },
      onGestureUpdate: (g) => { /* apply pan + zoom to canvasStore */ },
      onHoverMove: (x, y) => { /* update eraser cursor */ },
    },
  });

  inputManagerRef.current = inputManager;
  return () => inputManager.destroy();
}, []);
```

#### Coordinate conversion:

InputManager emits screen coordinates. The `onDrawStart` / `onDrawMove` callbacks in `drawing-canvas.tsx` convert to canvas (world) coordinates using the existing `screenToCanvas()` function — this stays in drawing-canvas since it depends on `canvasStore.panX/panY/zoom`.

### Settings Integration

#### SettingsModel addition:

```typescript
touchMode: types.optional(
  types.enumeration("TouchMode", ["auto", "stylus-only", "touch-draw"]),
  "auto"
)
```

Persisted to localStorage alongside existing settings via the existing `saveToStorage` / `loadFromStorage` pattern.

#### Sidebar UI:

Add a "Touch Mode" section in the left sidebar, below the existing "Background" section. Uses the same box-selector pattern as Background (three clickable boxes in a row, highlighted = active).

| Box | Label | Icon |
|---|---|---|
| 1 | Auto | `Pointer` (lucide) |
| 2 | Stylus Only | `PenTool` (lucide) |
| 3 | Touch Draw | `Hand` (lucide) |

Only visible when the device has touch capability: `navigator.maxTouchPoints > 0`.

### Engine re-export

Add to `src/engine/index.ts`:

```typescript
export * from "./InputManager";
```

## Out of Scope

- **Inertia/momentum** for pan gestures — self-contained enhancement, can add later
- **Canvas rotation gesture** (two-finger rotate) — complex, uncommon at this stage
- **Mobile UI redesign** — `mobile-canvas-view.tsx` stays as-is; this fixes the input pipeline
- **Three-finger gestures** (undo/redo) — can layer on later
- **Touch-size palm rejection** (`width`/`height` heuristic) — unreliable, deferred
- **Pointer capture** (`setPointerCapture`) — evaluate during implementation; may help with edge cases where pointer leaves the element mid-stroke

## File Changes Summary

| File | Change |
|---|---|
| `src/engine/InputManager.ts` | **New** — ~250-300 lines |
| `src/engine/index.ts` | Add re-export |
| `src/components/drawing-canvas.tsx` | Refactor: replace raw pointer handlers with InputManager, remove ~200 lines |
| `src/models/SettingsModel.ts` | Add `touchMode` field + save/load |
| `src/components/slider.tsx` | Add Touch Mode box-selector UI |

## Testing Strategy

Since only phone is available for testing:

1. **Phone (finger-only):** Test in "Touch Draw" mode — single finger draws, two-finger pinch/pan works
2. **Phone:** Test in "Stylus Only" mode — single finger pans, two-finger zoom, no drawing (verifies gesture-only path)
3. **Desktop (mouse):** Verify all existing behavior unchanged — mouse draws, scroll wheel zooms, space+drag pans
4. **Desktop:** Open DevTools, toggle "touch simulation" — test two-touch gestures with simulated touch
5. **Stylus path:** Not directly testable now, but the code path is simple (`pointerType === "pen"` → draw) and shares all rendering logic with finger drawing
