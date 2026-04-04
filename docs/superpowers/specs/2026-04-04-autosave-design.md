# Autosave & renderVersion Refactor — Design Spec

## Problem

1. **No autosave.** If the user closes the tab or browser crashes, all unsaved work is lost. The only save path is the manual "Save" button.
2. **`renderVersion` is manual.** Every action in `CanvasModel` that changes visual state must include `self.renderVersion++`. There are ~30 such calls. Forgetting one means the canvas doesn't repaint — a silent, hard-to-debug bug.

## Solution

Two changes shipped together:

1. **Auto-increment `renderVersion`** via MST `onPatch` middleware, removing all manual increments.
2. **Autosave** via a debounced MobX `reaction` on `renderVersion`, with a `beforeunload` safety net.

## Part 1: renderVersion Auto-Increment

### Current State

`renderVersion` is a volatile (non-persisted) counter on `CanvasModel`. It is incremented manually in ~30 actions (`addStroke`, `replaceStrokes`, `setEraserSize`, `undo`, `redo`, all layer operations, etc.). Two consumers watch it:

- `drawing-canvas.tsx` — `useEffect` calls `engine.invalidate()` on change
- `layers-panel.tsx` — passed as prop to trigger thumbnail re-renders

### New Behavior

Use MST's `onPatch` on `rootStore.canvasModel` to detect mutations and auto-bump `renderVersion`. Set up in `root-store.ts` after store creation.

#### Patch Filtering

Not every patch should trigger a repaint. Ignore patches to:

- `renderVersion` itself (avoid infinite loop)
- `history` and `historyIndex` (internal undo/redo bookkeeping, not visual)

All other patches on `canvasModel` are visual state changes that need a repaint.

#### Microtask Batching

A single user action (e.g., `undo`) may produce multiple patches (restore strokes, restore background, restore zoom, etc.). Without batching, `renderVersion` would increment N times per action.

Use a microtask batch: set a dirty flag on the first patch, schedule a `queueMicrotask` to bump `renderVersion` once, and reset the flag.

```typescript
let dirty = false;
onPatch(rootStore.canvasModel, (patch) => {
  if (patch.path.startsWith("/renderVersion")) return;
  if (patch.path.startsWith("/history")) return;
  if (patch.path.startsWith("/historyIndex")) return;
  if (!dirty) {
    dirty = true;
    queueMicrotask(() => {
      rootStore.canvasModel.bumpRenderVersion();
      dirty = false;
    });
  }
});
```

#### CanvasModel Changes

- Remove all `self.renderVersion++` calls (~30 occurrences)
- Add a single `bumpRenderVersion` action:

```typescript
bumpRenderVersion() {
  self.renderVersion++;
},
```

### Consumers Unchanged

`drawing-canvas.tsx` and `layers-panel.tsx` continue watching `renderVersion` the same way. No changes needed on the consumer side.

## Part 2: Autosave

### Trigger

MobX `reaction` watching `canvasStore.renderVersion`, debounced to 3 seconds.

### Location

`canvas-view.tsx` — a `useEffect` that sets up the reaction on mount and disposes on unmount.

### Save Flow

1. `renderVersion` changes (user drew a stroke, moved a layer, etc.)
2. Debounce timer starts (3 seconds)
3. If more changes arrive, the timer resets
4. User pauses for 3 seconds → autosave fires
5. Skip if `canvasStore.isEmpty` (don't create blank drawings)
6. If `currentDrawingId` is null (new unsaved drawing), create a new drawing and capture the ID for future updates
7. Reuse the same save logic as `handleSave` — layer mapping, stroke optimization, thumbnail generation, vault write

### Autosave Function

Extract the core save logic from the current `handleSave` into a reusable `performSave` function. Both manual save and autosave call it. The difference:

- **Manual save** (`handleSave`): calls `performSave()`, shows toast on success
- **Autosave**: calls `performSave()`, updates save status indicator (no toast)

### Debounce Implementation

Use a `reaction` from `mobx` with a manual debounce via `setTimeout`:

```typescript
useEffect(() => {
  let debounceTimer: number | null = null;

  const disposer = reaction(
    () => canvasStore.renderVersion,
    () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        triggerAutosave();
      }, 3000);
    },
  );

  return () => {
    disposer();
    if (debounceTimer !== null) clearTimeout(debounceTimer);
  };
}, []);
```

### Save Status State

New state in `canvas-view.tsx`:

```typescript
const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
```

Transitions:
- `idle` → `saving`: autosave or manual save starts
- `saving` → `saved`: save completes successfully
- `saved` → `idle`: after 2 seconds (auto-reset via `setTimeout`)
- `saving` → `idle`: save fails (log error, don't crash)

### Save Status Indicator UI

Next to the drawing name input in the top bar:

- `saving`: Small spinning `Loader2` icon (lucide), 16px, muted color
- `saved`: Small `Check` icon (lucide), 16px, green, fades to idle after 2s
- `idle`: Nothing shown

### Manual Save Button

The save button in the sidebar still works. When clicked:
- Cancel any pending autosave debounce timer
- Save immediately
- Show toast ("Drawing saved successfully!") as before
- Update save status indicator

### beforeunload Safety Net

Add a `beforeunload` listener that warns the user if there are unsaved changes:

```typescript
window.addEventListener("beforeunload", (e) => {
  if (isDirtyRef.current) {
    e.preventDefault();
  }
});
```

Track dirty state via a ref: `isDirtyRef` goes `true` when `renderVersion` changes, `false` after a successful save. The browser will show its native "Leave site?" dialog if the user tries to close with unsaved changes.

Note: We do NOT attempt a synchronous save in `beforeunload` — IndexedDB writes are async and unreliable in this context. The browser's native warning is the safety net.

### Dirty Tracking

A ref `isDirtyRef` tracks whether there are unsaved changes:

- Set `true` in the `reaction` callback (when `renderVersion` changes)
- Set `false` after a successful `performSave()`
- Read in `beforeunload` handler

This is a ref (not state) because `beforeunload` needs synchronous access without stale closure issues.

## File Changes Summary

| File | Change |
|---|---|
| `src/stores/root-store.ts` | Add `onPatch` middleware for auto `renderVersion` |
| `src/models/CanvasModel.ts` | Remove ~30 `self.renderVersion++` calls, add `bumpRenderVersion` action |
| `src/components/canvas-view.tsx` | Extract `performSave`, add autosave reaction, save status state, beforeunload handler, status indicator UI |

## Out of Scope

- **Offline sync / cloud save** — this is local IndexedDB only
- **Save conflict resolution** — single-user app, no conflicts possible
- **Autosave settings UI** (toggle on/off, adjust delay) — can add later if needed
- **Debounce delay customization** — hardcoded to 3s, good enough for now
