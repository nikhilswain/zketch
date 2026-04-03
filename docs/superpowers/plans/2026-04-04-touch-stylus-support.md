# Touch & Stylus Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proper touch gesture support (pinch-to-zoom, two-finger pan, palm rejection) and stylus drawing separation to the zketch drawing app.

**Architecture:** Create an `InputManager` engine class that sits between raw pointer events and the canvas, classifying input intent (draw vs gesture) based on pointer type and touch count. Refactor `drawing-canvas.tsx` to subscribe to high-level events from InputManager instead of handling raw pointers. Add a user-facing Touch Mode setting with three modes (Auto, Stylus Only, Touch Draw).

**Tech Stack:** TypeScript, React, MobX-State-Tree, Pointer Events API

---

## File Structure

| File | Role | Change |
|---|---|---|
| `src/engine/InputManager.ts` | Pointer tracking, intent classification, gesture recognition, event emission | **Create** |
| `src/engine/index.ts` | Engine barrel export | **Modify** — add InputManager re-export |
| `src/models/SettingsModel.ts` | App settings with persistence | **Modify** — add `touchMode` field |
| `src/components/slider.tsx` | Left sidebar UI | **Modify** — add Touch Mode box-selector |
| `src/components/drawing-canvas.tsx` | Canvas interaction layer | **Modify** — replace raw pointer handlers with InputManager |

---

### Task 1: Create InputManager — Types and Skeleton

**Files:**
- Create: `src/engine/InputManager.ts`

- [ ] **Step 1: Create InputManager with types and empty class**

Create `src/engine/InputManager.ts` with the following content:

```typescript
/**
 * InputManager — Classifies pointer input into drawing vs gesture intents.
 *
 * Sits between raw PointerEvents and the canvas component.
 * Tracks all active pointers, detects multi-touch gestures (pinch-to-zoom,
 * two-finger pan), and emits high-level events for drawing and gestures.
 */

export type TouchMode = "auto" | "stylus-only" | "touch-draw";

type InputIntent = "draw" | "gesture" | "ignore";

interface TrackedPointer {
  id: number;
  type: "mouse" | "pen" | "touch";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  previousX: number;
  previousY: number;
  startTime: number;
  pressure: number;
}

export interface GestureUpdate {
  panDeltaX: number;
  panDeltaY: number;
  zoomDelta: number;
  zoomCenterX: number;
  zoomCenterY: number;
}

export interface InputPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface InputManagerCallbacks {
  onDrawStart?: (point: InputPoint, pointerType: string) => void;
  onDrawMove?: (point: InputPoint) => void;
  onDrawEnd?: () => void;
  onDrawCancel?: () => void;
  onGestureStart?: () => void;
  onGestureUpdate?: (gesture: GestureUpdate) => void;
  onGestureEnd?: () => void;
  onHoverMove?: (screenX: number, screenY: number) => void;
}

export interface InputManagerConfig {
  getTouchMode: () => TouchMode;
  getIsDrawingMode: () => boolean;
  callbacks: InputManagerCallbacks;
}

export class InputManager {
  private root: HTMLElement;
  private config: InputManagerConfig;
  private activePointers = new Map<number, TrackedPointer>();
  private currentIntent: InputIntent = "ignore";
  private penActive = false;
  private panOverride = false;

  // Gesture state
  private gestureActive = false;
  private gestureStartDistance = 0;
  private gestureStartCenterX = 0;
  private gestureStartCenterY = 0;
  private gesturePrevCenterX = 0;
  private gesturePrevCenterY = 0;
  private gesturePrevDistance = 0;

  // Gesture start threshold
  private gestureThresholdMet = false;
  private gestureThresholdTimer: number | null = null;
  private static GESTURE_THRESHOLD_PX = 5;
  private static GESTURE_THRESHOLD_MS = 50;

  constructor(root: HTMLElement, config: InputManagerConfig) {
    this.root = root;
    this.config = config;
    this.attachListeners();
  }

  /** Allow external code to force pan mode (e.g., space key held) */
  setPanOverride(active: boolean): void {
    this.panOverride = active;
  }

  /** Update callbacks without recreating the manager */
  setCallbacks(callbacks: InputManagerCallbacks): void {
    this.config.callbacks = callbacks;
  }

  /** Clean up all listeners */
  destroy(): void {
    this.detachListeners();
    if (this.gestureThresholdTimer !== null) {
      clearTimeout(this.gestureThresholdTimer);
      this.gestureThresholdTimer = null;
    }
    this.activePointers.clear();
  }

  // ============================================
  // Listener Management
  // ============================================

  private attachListeners(): void {
    this.root.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    this.root.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    this.root.addEventListener("pointerup", this.handlePointerUp, { passive: false });
    this.root.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
    this.root.addEventListener("pointerleave", this.handlePointerLeave, { passive: false });
    // Block browser gestures on touch
    this.root.addEventListener("touchstart", this.preventTouch, { passive: false });
    this.root.addEventListener("touchmove", this.preventTouch, { passive: false });
    this.root.addEventListener("gesturestart", this.preventGesture, { passive: false });
    this.root.addEventListener("gesturechange", this.preventGesture, { passive: false });
  }

  private detachListeners(): void {
    this.root.removeEventListener("pointerdown", this.handlePointerDown);
    this.root.removeEventListener("pointermove", this.handlePointerMove);
    this.root.removeEventListener("pointerup", this.handlePointerUp);
    this.root.removeEventListener("pointercancel", this.handlePointerUp);
    this.root.removeEventListener("pointerleave", this.handlePointerLeave);
    this.root.removeEventListener("touchstart", this.preventTouch);
    this.root.removeEventListener("touchmove", this.preventTouch);
    this.root.removeEventListener("gesturestart", this.preventGesture);
    this.root.removeEventListener("gesturechange", this.preventGesture);
  }

  private preventTouch = (e: TouchEvent): void => {
    // Prevent browser default touch behaviors (scroll, zoom, etc.)
    // We handle all touch interactions ourselves
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  };

  private preventGesture = (e: Event): void => {
    e.preventDefault();
  };

  // ============================================
  // Intent Classification
  // ============================================

  private classifyIntent(pointerType: string): InputIntent {
    const mode = this.config.getTouchMode();
    const touchCount = this.getTouchPointerCount();

    // Palm rejection: if pen is actively drawing, ignore all touch
    if (this.penActive && pointerType === "touch") {
      return "ignore";
    }

    // Pan override (space key held)
    if (this.panOverride) {
      return "gesture";
    }

    // Not in drawing mode = always gesture (pan)
    if (!this.config.getIsDrawingMode()) {
      return "gesture";
    }

    // Mouse always draws (existing desktop behavior)
    if (pointerType === "mouse") {
      return "draw";
    }

    // Pen always draws in all modes
    if (pointerType === "pen") {
      return "draw";
    }

    // Touch classification depends on mode and count
    if (pointerType === "touch") {
      switch (mode) {
        case "auto":
        case "touch-draw":
          return touchCount >= 2 ? "gesture" : "draw";
        case "stylus-only":
          return "gesture"; // Touch never draws in stylus-only mode
      }
    }

    return "ignore";
  }

  private getTouchPointerCount(): number {
    let count = 0;
    for (const pointer of this.activePointers.values()) {
      if (pointer.type === "touch") count++;
    }
    return count;
  }

  // ============================================
  // Gesture Math
  // ============================================

  private getTwoTouchPointers(): [TrackedPointer, TrackedPointer] | null {
    const touches: TrackedPointer[] = [];
    for (const pointer of this.activePointers.values()) {
      if (pointer.type === "touch") {
        touches.push(pointer);
        if (touches.length === 2) break;
      }
    }
    return touches.length === 2 ? [touches[0], touches[1]] : null;
  }

  private getDistance(a: TrackedPointer, b: TrackedPointer): number {
    const dx = a.currentX - b.currentX;
    const dy = a.currentY - b.currentY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getCenter(a: TrackedPointer, b: TrackedPointer): { x: number; y: number } {
    return {
      x: (a.currentX + b.currentX) / 2,
      y: (a.currentY + b.currentY) / 2,
    };
  }

  private checkGestureThreshold(a: TrackedPointer, b: TrackedPointer): boolean {
    const dxA = a.currentX - a.startX;
    const dyA = a.currentY - a.startY;
    const dxB = b.currentX - b.startX;
    const dyB = b.currentY - b.startY;
    const movedA = Math.sqrt(dxA * dxA + dyA * dyA);
    const movedB = Math.sqrt(dxB * dxB + dyB * dyB);
    return movedA > InputManager.GESTURE_THRESHOLD_PX || movedB > InputManager.GESTURE_THRESHOLD_PX;
  }

  private initGestureState(a: TrackedPointer, b: TrackedPointer): void {
    const dist = this.getDistance(a, b);
    const center = this.getCenter(a, b);
    this.gestureStartDistance = dist;
    this.gesturePrevDistance = dist;
    this.gestureStartCenterX = center.x;
    this.gestureStartCenterY = center.y;
    this.gesturePrevCenterX = center.x;
    this.gesturePrevCenterY = center.y;
    this.gestureActive = true;
    this.gestureThresholdMet = false;
  }

  private computeGestureUpdate(a: TrackedPointer, b: TrackedPointer): GestureUpdate {
    const dist = this.getDistance(a, b);
    const center = this.getCenter(a, b);

    const update: GestureUpdate = {
      panDeltaX: center.x - this.gesturePrevCenterX,
      panDeltaY: center.y - this.gesturePrevCenterY,
      zoomDelta: this.gesturePrevDistance > 0 ? dist / this.gesturePrevDistance : 1,
      zoomCenterX: center.x,
      zoomCenterY: center.y,
    };

    this.gesturePrevCenterX = center.x;
    this.gesturePrevCenterY = center.y;
    this.gesturePrevDistance = dist;

    return update;
  }

  // ============================================
  // Event Handlers
  // ============================================

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();

    const pointer: TrackedPointer = {
      id: e.pointerId,
      type: e.pointerType as "mouse" | "pen" | "touch",
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      previousX: e.clientX,
      previousY: e.clientY,
      startTime: performance.now(),
      pressure: e.pressure || 0.5,
    };

    this.activePointers.set(e.pointerId, pointer);

    // Track pen state for palm rejection
    if (e.pointerType === "pen") {
      this.penActive = true;
    }

    const intent = this.classifyIntent(e.pointerType);

    if (intent === "ignore") {
      return;
    }

    if (intent === "gesture") {
      // If we were drawing, cancel the stroke first
      if (this.currentIntent === "draw") {
        this.config.callbacks.onDrawCancel?.();
      }

      this.currentIntent = "gesture";

      // For two-finger gestures, initialize gesture state
      const pair = this.getTwoTouchPointers();
      if (pair) {
        this.initGestureState(pair[0], pair[1]);

        // Start threshold timer
        if (this.gestureThresholdTimer !== null) {
          clearTimeout(this.gestureThresholdTimer);
        }
        this.gestureThresholdTimer = window.setTimeout(() => {
          this.gestureThresholdMet = true;
          this.gestureThresholdTimer = null;
        }, InputManager.GESTURE_THRESHOLD_MS);

        this.config.callbacks.onGestureStart?.();
      } else if (this.config.getTouchMode() === "stylus-only" && pointer.type === "touch") {
        // Single finger pan in stylus-only mode
        this.gestureActive = true;
        this.gestureThresholdMet = true;
        this.gesturePrevCenterX = pointer.currentX;
        this.gesturePrevCenterY = pointer.currentY;
        this.config.callbacks.onGestureStart?.();
      } else if (this.panOverride || !this.config.getIsDrawingMode()) {
        // Pan override (space held) or pan mode — single pointer pan
        this.gestureActive = true;
        this.gestureThresholdMet = true;
        this.gesturePrevCenterX = pointer.currentX;
        this.gesturePrevCenterY = pointer.currentY;
        this.config.callbacks.onGestureStart?.();
      }
      return;
    }

    // intent === "draw"
    this.currentIntent = "draw";
    this.config.callbacks.onDrawStart?.(
      { x: e.clientX, y: e.clientY, pressure: e.pressure || 0.5 },
      e.pointerType,
    );
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const pointer = this.activePointers.get(e.pointerId);

    // Hover tracking (no active pointer — mouse/pen hovering over canvas)
    if (!pointer) {
      this.config.callbacks.onHoverMove?.(e.clientX, e.clientY);
      return;
    }

    // Update pointer position
    pointer.previousX = pointer.currentX;
    pointer.previousY = pointer.currentY;
    pointer.currentX = e.clientX;
    pointer.currentY = e.clientY;
    pointer.pressure = e.pressure || 0.5;

    // Re-classify intent — touch count may have changed
    const intent = this.classifyIntent(e.pointerType);

    if (intent === "ignore") return;

    // Handle gesture updates (two-finger pinch/pan or single-finger pan)
    if (this.currentIntent === "gesture" && this.gestureActive) {
      const pair = this.getTwoTouchPointers();
      if (pair) {
        // Two-finger gesture: check threshold, then emit updates
        if (!this.gestureThresholdMet) {
          if (this.checkGestureThreshold(pair[0], pair[1])) {
            this.gestureThresholdMet = true;
            if (this.gestureThresholdTimer !== null) {
              clearTimeout(this.gestureThresholdTimer);
              this.gestureThresholdTimer = null;
            }
          } else {
            return; // Threshold not yet met
          }
        }
        const update = this.computeGestureUpdate(pair[0], pair[1]);
        this.config.callbacks.onGestureUpdate?.(update);
      } else {
        // Single pointer pan (stylus-only mode, pan override, or pan mode)
        const update: GestureUpdate = {
          panDeltaX: pointer.currentX - pointer.previousX,
          panDeltaY: pointer.currentY - pointer.previousY,
          zoomDelta: 1,
          zoomCenterX: pointer.currentX,
          zoomCenterY: pointer.currentY,
        };
        this.config.callbacks.onGestureUpdate?.(update);
      }
      return;
    }

    // Handle draw moves
    if (this.currentIntent === "draw") {
      // Check if a second touch appeared — need to switch to gesture
      if (e.pointerType === "touch" && this.getTouchPointerCount() >= 2) {
        // Mid-stroke cancellation
        this.config.callbacks.onDrawCancel?.();
        this.currentIntent = "gesture";

        const pair = this.getTwoTouchPointers();
        if (pair) {
          this.initGestureState(pair[0], pair[1]);

          if (this.gestureThresholdTimer !== null) {
            clearTimeout(this.gestureThresholdTimer);
          }
          this.gestureThresholdTimer = window.setTimeout(() => {
            this.gestureThresholdMet = true;
            this.gestureThresholdTimer = null;
          }, InputManager.GESTURE_THRESHOLD_MS);

          this.config.callbacks.onGestureStart?.();
        }
        return;
      }

      this.config.callbacks.onDrawMove?.(
        { x: e.clientX, y: e.clientY, pressure: e.pressure || 0.5 },
      );

      // Also emit hover for eraser cursor tracking during drawing
      this.config.callbacks.onHoverMove?.(e.clientX, e.clientY);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    const pointer = this.activePointers.get(e.pointerId);
    if (!pointer) return;

    this.activePointers.delete(e.pointerId);

    // Clear pen state when pen lifts
    if (e.pointerType === "pen") {
      this.penActive = false;
    }

    // If this was the last touch pointer in a gesture, end the gesture
    if (this.currentIntent === "gesture") {
      const touchCount = this.getTouchPointerCount();
      if (touchCount < 2 && this.gestureActive) {
        this.gestureActive = false;
        this.gestureThresholdMet = false;
        if (this.gestureThresholdTimer !== null) {
          clearTimeout(this.gestureThresholdTimer);
          this.gestureThresholdTimer = null;
        }
        this.config.callbacks.onGestureEnd?.();

        // If one finger remains and mode allows drawing, don't auto-start drawing
        // User needs to lift all fingers and start fresh
        if (touchCount === 0) {
          this.currentIntent = "ignore";
        }
      }
      // For single-pointer pan (mouse/pen in pan mode), end when pointer lifts
      if (touchCount === 0 && this.activePointers.size === 0) {
        if (this.gestureActive) {
          this.gestureActive = false;
          this.config.callbacks.onGestureEnd?.();
        }
        this.currentIntent = "ignore";
      }
      return;
    }

    // End drawing
    if (this.currentIntent === "draw") {
      this.config.callbacks.onDrawEnd?.();
      this.currentIntent = "ignore";
    }
  };

  private handlePointerLeave = (e: PointerEvent): void => {
    // Treat like pointerup for the leaving pointer
    this.handlePointerUp(e);
  };
}
```

- [ ] **Step 2: Add re-export to engine index**

In `src/engine/index.ts`, add:

```typescript
export * from "./InputManager";
```

Add it after the existing exports.

- [ ] **Step 3: Verify the project builds**

Run: `npx astro check` or `npx tsc --noEmit`

Expected: No type errors from the new file. If there's no tsconfig check command set up, just run `npm run build` and verify no build errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/InputManager.ts src/engine/index.ts
git commit -m "feat: add InputManager engine class for touch/stylus input handling"
```

---

### Task 2: Add touchMode to SettingsModel

**Files:**
- Modify: `src/models/SettingsModel.ts`

- [ ] **Step 1: Add touchMode field to SettingsModel**

In `src/models/SettingsModel.ts`, add the `touchMode` field to the model definition. Find this line:

```typescript
    snapToGrid: types.optional(types.boolean, false),
```

Add after it:

```typescript
    // Touch input mode: auto (pen+finger draw), stylus-only (pen draws, finger gestures), touch-draw (finger draws)
    touchMode: types.optional(
      types.enumeration("TouchMode", ["auto", "stylus-only", "touch-draw"]),
      "auto",
    ),
```

- [ ] **Step 2: Add touchMode to saveToStorage**

In the `saveToStorage` action, find:

```typescript
          snapToGrid: self.snapToGrid,
```

Add after it:

```typescript
          touchMode: self.touchMode,
```

- [ ] **Step 3: Add touchMode to loadFromStorage**

In the `loadFromStorage` action, find:

```typescript
          self.snapToGrid = settings.snapToGrid ?? self.snapToGrid;
```

Add after it:

```typescript
          self.touchMode = settings.touchMode ?? self.touchMode;
```

- [ ] **Step 4: Add setTouchMode action**

In the return block of the second `.actions()` call, find:

```typescript
      setUIPreferences(
```

Add before it:

```typescript
      setTouchMode(mode: "auto" | "stylus-only" | "touch-draw") {
        self.touchMode = mode;
        saveToStorage();
      },
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/models/SettingsModel.ts
git commit -m "feat: add touchMode setting to SettingsModel"
```

---

### Task 3: Add Touch Mode UI to Sidebar

**Files:**
- Modify: `src/components/slider.tsx`

- [ ] **Step 1: Add imports**

In `src/components/slider.tsx`, find the lucide import block:

```typescript
import {
  Undo2,
  Redo2,
  Trash2,
  Save,
  Download,
  Palette,
  Grid3X3,
  Square,
  SquareDot,
  ChevronLeft,
  ImagePlus,
} from "lucide-react";
```

Add `Pointer`, `PenTool`, and `Hand` to the import:

```typescript
import {
  Undo2,
  Redo2,
  Trash2,
  Save,
  Download,
  Palette,
  Grid3X3,
  Square,
  SquareDot,
  ChevronLeft,
  ImagePlus,
  Pointer,
  PenTool,
  Hand,
} from "lucide-react";
```

- [ ] **Step 2: Add touch mode options array and hasTouchSupport check**

Inside the `Sidebar` component, after the `backgroundOptions` array definition (after line 64), add:

```typescript
    const touchModeOptions: {
      value: "auto" | "stylus-only" | "touch-draw";
      label: string;
      icon: React.ReactNode;
    }[] = [
      { value: "auto", label: "Auto", icon: <Pointer className="w-4 h-4" /> },
      {
        value: "stylus-only",
        label: "Stylus Only",
        icon: <PenTool className="w-4 h-4" />,
      },
      {
        value: "touch-draw",
        label: "Touch Draw",
        icon: <Hand className="w-4 h-4" />,
      },
    ];

    const hasTouchSupport =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
```

- [ ] **Step 3: Add Touch Mode card to the sidebar JSX**

Find the Background `</Card>` closing tag (the one right before the `{/* Actions */}` comment). Add the Touch Mode card after it:

```tsx
            {/* Touch Mode - only shown on touch-capable devices */}
            {hasTouchSupport && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Touch Mode
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {touchModeOptions.map((tm) => (
                      <button
                        key={tm.value}
                        onClick={() => settingsStore.setTouchMode(tm.value)}
                        className={`flex flex-col items-center gap-1 p-3 rounded border-2 transition-all ${
                          settingsStore.touchMode === tm.value
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {tm.icon}
                        <span className="text-xs">{tm.label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
```

- [ ] **Step 4: Verify build and visual check**

Run: `npm run dev`

Open the app in a browser. The Touch Mode section should appear in the left sidebar if using a touch-capable device (or Chrome DevTools with touch simulation enabled). The three boxes should be selectable with blue highlight on the active one.

- [ ] **Step 5: Commit**

```bash
git add src/components/slider.tsx
git commit -m "feat: add Touch Mode selector UI to sidebar"
```

---

### Task 4: Refactor drawing-canvas.tsx to Use InputManager

This is the largest task. We replace all raw pointer handling with InputManager subscriptions while keeping all other functionality (engine mounting, transform mode, preview rendering, wheel zoom, clipboard paste) intact.

**Files:**
- Modify: `src/components/drawing-canvas.tsx`

- [ ] **Step 1: Add InputManager import and settings store hook**

At the top of `src/components/drawing-canvas.tsx`, find:

```typescript
import { CanvasEngine, transformController } from "@/engine";
```

Change to:

```typescript
import { CanvasEngine, transformController, InputManager } from "@/engine";
```

Find:

```typescript
import { useCanvasStore } from "../hooks/useStores";
```

Change to:

```typescript
import { useCanvasStore, useSettingsStore } from "../hooks/useStores";
```

- [ ] **Step 2: Add settingsStore and inputManagerRef, remove old state**

Inside the component, find:

```typescript
    const canvasStore = useCanvasStore();
```

Add after it:

```typescript
    const settingsStore = useSettingsStore();
```

Find and add after `engineRef`:

```typescript
    const inputManagerRef = useRef<InputManager | null>(null);
```

Remove these state declarations (they move into InputManager or are no longer needed):

```typescript
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPoint, setLastPanPoint] = useState<{
      x: number;
      y: number;
    } | null>(null);
```

Keep `isDrawing`, `currentPoints`, `spacePressed`, `mousePosition`, `isTransforming`, `transformHandle`, `transformStart`, `strokeStartTimeRef`. These are still used by drawing-canvas for its own state.

- [ ] **Step 3: Replace the keyboard + touch prevention useEffect**

Find the entire `useEffect` block that starts with:

```typescript
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
```

And ends with the return cleanup that removes `keydown`, `keyup`, `wheel`, `touchstart`, `gesturestart` listeners.

Replace it with this simplified version (InputManager now handles touch/gesture prevention):

```typescript
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          setSpacePressed(true);
          inputManagerRef.current?.setPanOverride(true);
        }
        if (e.key === "Shift") {
          shiftDownRef.current = true;
        }
        // ESC to exit transform mode
        if (e.key === "Escape" && canvasStore.isTransformMode) {
          e.preventDefault();
          canvasStore.deselectLayer();
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          e.preventDefault();
          setSpacePressed(false);
          inputManagerRef.current?.setPanOverride(false);
        }
        if (e.key === "Shift") {
          shiftDownRef.current = false;
          lastShiftUpTsRef.current = performance.now();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);
```

Note: the `handleGlobalWheel`, `handleTouchStart`, and `handleGestureStart` listeners are removed — InputManager handles touch/gesture prevention via its own listeners on the root element.

- [ ] **Step 4: Add InputManager mounting useEffect**

Add a new `useEffect` right after the CanvasEngine mounting effect (the one that creates `new CanvasEngine(root, {...})`). This mounts the InputManager:

```typescript
    // Mount InputManager for touch/stylus input handling
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      // We use refs for callbacks that need access to latest state
      // without causing InputManager recreation
      const manager = new InputManager(root, {
        getTouchMode: () => settingsStore.touchMode as "auto" | "stylus-only" | "touch-draw",
        getIsDrawingMode: () => isDrawingMode,
        callbacks: {},
      });

      inputManagerRef.current = manager;

      return () => {
        manager.destroy();
        inputManagerRef.current = null;
      };
    }, []);

    // Update InputManager callbacks when dependencies change
    useEffect(() => {
      const manager = inputManagerRef.current;
      if (!manager) return;

      manager.setCallbacks({
        onDrawStart: (pt, pointerType) => {
          const root = rootRef.current;
          if (!root) return;

          const canvasPoint = screenToCanvas(pt.x, pt.y);
          canvasPoint.pressure = pt.pressure;

          // If in transform mode, check for handle interactions first
          if (canvasStore.isTransformMode && canvasStore.selectedImageLayer) {
            const handle = hitTestTransformHandles(pt.x, pt.y);
            if (handle) {
              const rect = root.getBoundingClientRect();
              const localX = pt.x - rect.left;
              const localY = pt.y - rect.top;
              const viewport = {
                panX: canvasStore.panX,
                panY: canvasStore.panY,
                zoom: canvasStore.zoom,
              };
              const startState = transformController.captureStartState(
                { x: localX, y: localY },
                canvasStore.selectedImageLayer as ImageLayerLike,
                viewport,
              );
              setIsTransforming(true);
              setTransformHandle(handle);
              setTransformStart(startState);
              return;
            }
          }

          // Check if clicking on an image layer
          const hitLayerId = hitTestImageLayers(canvasPoint.x, canvasPoint.y);
          if (hitLayerId) {
            canvasStore.selectLayer(hitLayerId);
            return;
          }

          // If in transform mode but clicked outside any image, deselect
          if (canvasStore.isTransformMode) {
            canvasStore.deselectLayer();
          }

          // Start drawing
          strokeStartTimeRef.current = Date.now();
          setIsDrawing(true);
          setCurrentPoints([canvasPoint]);
        },

        onDrawMove: (pt) => {
          const canvasPoint = screenToCanvas(pt.x, pt.y);
          canvasPoint.pressure = pt.pressure;

          // Min-distance filter
          const MIN_DIST = 0.5;
          setCurrentPoints((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return [canvasPoint];
            const dx = canvasPoint.x - last.x;
            const dy = canvasPoint.y - last.y;
            if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return prev;
            return [...prev, canvasPoint];
          });
        },

        onDrawEnd: () => {
          setIsDrawing(false);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
          // Commit stroke — we read currentPoints via a ref-based approach
          // This is handled in a separate useEffect that watches isDrawing transitions
        },

        onDrawCancel: () => {
          setIsDrawing(false);
          setCurrentPoints([]);
          if (previewRafRef.current) {
            cancelAnimationFrame(previewRafRef.current);
            previewRafRef.current = null;
          }
          engineRef.current?.setPreviewStroke(null);
          engineRef.current?.invalidate();
        },

        onGestureStart: () => {
          // Nothing special needed on gesture start
        },

        onGestureUpdate: (gesture) => {
          const root = rootRef.current;
          if (!root) return;

          // Apply pan
          canvasStore.setPan(
            canvasStore.panX + gesture.panDeltaX,
            canvasStore.panY + gesture.panDeltaY,
          );

          // Apply zoom around gesture center
          if (gesture.zoomDelta !== 1) {
            const rect = root.getBoundingClientRect();
            const localX = gesture.zoomCenterX - rect.left;
            const localY = gesture.zoomCenterY - rect.top;

            const newZoom = Math.max(0.1, Math.min(5, canvasStore.zoom * gesture.zoomDelta));
            const worldX = (localX - canvasStore.panX) / canvasStore.zoom;
            const worldY = (localY - canvasStore.panY) / canvasStore.zoom;
            const newPanX = localX - worldX * newZoom;
            const newPanY = localY - worldY * newZoom;

            canvasStore.setZoom(newZoom);
            canvasStore.setPan(newPanX, newPanY);
          }
        },

        onGestureEnd: () => {
          // Nothing special needed
        },

        onHoverMove: (screenX, screenY) => {
          setMousePosition({ x: screenX, y: screenY });
        },
      });
    }, [
      screenToCanvas,
      isDrawingMode,
      hitTestImageLayers,
      hitTestTransformHandles,
      canvasStore,
    ]);
```

- [ ] **Step 5: Add stroke commit logic on drawing end**

The `onDrawEnd` callback sets `isDrawing` to false but can't reliably read `currentPoints` due to React state batching. Add a `useEffect` that commits the stroke when drawing ends. Find a good spot after the InputManager mounting effect and add:

```typescript
    // Commit stroke when drawing ends
    const prevIsDrawingRef = useRef(false);
    useEffect(() => {
      // Detect transition from drawing -> not drawing
      if (prevIsDrawingRef.current && !isDrawing && currentPoints.length > 1) {
        const endTime = Date.now();
        const startTime = strokeStartTimeRef.current ?? endTime;
        const duration = endTime - startTime;
        strokeStartTimeRef.current = null;

        const strokeData = {
          id: crypto.randomUUID(),
          points: currentPoints.map((point) => ({ ...point })),
          color: canvasStore.currentColor,
          size:
            canvasStore.currentBrushStyle === "eraser"
              ? canvasStore.eraserSize
              : canvasStore.currentSize,
          opacity: canvasStore.brushSettings.opacity ?? 1,
          brushStyle: canvasStore.currentBrushStyle,
          timestamp: endTime,
          startTime,
          duration,
          thinning: canvasStore.brushSettings.thinning,
          smoothing: canvasStore.brushSettings.smoothing,
          streamline: canvasStore.brushSettings.streamline,
          taperStart: canvasStore.brushSettings.taperStart,
          taperEnd: canvasStore.brushSettings.taperEnd,
        };

        if (canvasStore.hasLayers) {
          canvasStore.addStrokeToActiveLayer(strokeData);
        } else {
          canvasStore.addStroke(strokeData);
        }

        setCurrentPoints([]);
        engineRef.current?.setPreviewStroke(null);
        engineRef.current?.invalidate();
      }
      prevIsDrawingRef.current = isDrawing;
    }, [isDrawing, currentPoints, canvasStore]);
```

- [ ] **Step 6: Remove old handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave callbacks**

Delete the following `useCallback` blocks entirely:
- `handlePointerDown` (the large callback starting around line 381)
- `handlePointerMove` (around line 465)
- `handlePointerUp` (around line 560)
- `handlePointerLeave` (around line 838)

These are all replaced by InputManager.

- [ ] **Step 7: Keep handlePointerMove only for transform operations**

Since transform operations (image layer move/resize/rotate) still need pointer tracking, and `onDrawStart` already initiates transforms, we need to handle transform movement. Add this to the InputManager `onDrawMove` section or as a separate effect.

Actually, transforms are already initiated in `onDrawStart`. For the movement, we need to handle `pointermove` for transforms. The simplest approach: add a `pointermove` handler on the root div just for transforms:

```typescript
    // Handle transform pointer moves (image layer move/resize/rotate)
    const handleTransformMove = useCallback(
      (e: React.PointerEvent) => {
        if (!isTransforming || !transformHandle || !transformStart || !canvasStore.selectedImageLayer) return;

        const layer = canvasStore.selectedImageLayer as any;
        const root = rootRef.current;
        if (!root) return;
        const rect = root.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;

        const viewport = {
          panX: canvasStore.panX,
          panY: canvasStore.panY,
          zoom: canvasStore.zoom,
        };

        let result;
        if (transformHandle === "move") {
          result = transformController.applyMove(
            { x: localX, y: localY },
            transformStart,
            viewport,
          );
          layer.setPosition(result.x, result.y);
        } else if (transformHandle === "rotate") {
          result = transformController.applyRotation(
            { x: localX, y: localY },
            transformStart,
            viewport,
          );
          layer.setRotation(result.rotation);
        } else if (["nw", "ne", "se", "sw"].includes(transformHandle)) {
          const maintainAspect = !e.shiftKey;
          result = transformController.applyResize(
            transformHandle as "nw" | "ne" | "se" | "sw",
            { x: localX, y: localY },
            transformStart,
            viewport,
            maintainAspect,
          );
          layer.setPosition(result.x, result.y);
          layer.setSize(result.width, result.height, false);
        }
      },
      [isTransforming, transformHandle, transformStart, canvasStore],
    );

    const handleTransformUp = useCallback(
      (e: React.PointerEvent) => {
        if (!isTransforming) return;
        setIsTransforming(false);
        setTransformHandle(null);
        setTransformStart(null);
        canvasStore.saveCurrentStateToHistory();
      },
      [isTransforming, canvasStore],
    );
```

- [ ] **Step 8: Update the JSX to remove old pointer handlers, add transform handlers**

Find the root div JSX:

```tsx
    return (
      <div
        ref={rootRef}
        className={`fixed inset-0 touch-none ${getCursorStyle()} ${className}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
```

Replace with:

```tsx
    return (
      <div
        ref={rootRef}
        className={`fixed inset-0 touch-none ${getCursorStyle()} ${className}`}
        tabIndex={0}
        onPointerMove={isTransforming ? handleTransformMove : undefined}
        onPointerUp={isTransforming ? handleTransformUp : undefined}
        onContextMenu={(e) => e.preventDefault()}
```

Note: `onPointerDown` is removed (InputManager handles it). `onPointerMove` and `onPointerUp` are only attached during transforms.

- [ ] **Step 9: Update getCursorStyle**

The `getCursorStyle` function references `isPanning` which no longer exists as state. Update it:

Find:

```typescript
    const getCursorStyle = () => {
      if (spacePressed || isPanning) return "cursor-grabbing";
      if (!isDrawingMode) return "cursor-grab";
```

Replace with:

```typescript
    const getCursorStyle = () => {
      if (spacePressed) return "cursor-grabbing";
      if (!isDrawingMode) return "cursor-grab";
```

- [ ] **Step 10: Clean up unused imports and remove old wheel-related global listener**

The `handleGlobalWheel` was in the removed `useEffect`. The `handleWheel` for actual canvas zoom/pan is still needed — make sure the `useEffect` that attaches `handleWheel` to the root element with `{ passive: false }` is still present. It should already be there as a separate effect (around line 696 in the original).

Remove any unused imports. The `isPanning` and `lastPanPoint` state were removed in Step 2, so any references in remaining code should be gone. Check for any remaining references and remove them.

- [ ] **Step 11: Verify build**

Run: `npm run build`
Expected: No type errors. No missing references.

- [ ] **Step 12: Manual test on desktop**

Run: `npm run dev`

Test:
- Mouse drawing works (click and drag creates strokes)
- Mouse wheel zoom works (scroll to zoom in/out)
- Space + drag pans the canvas
- Eraser cursor shows correctly
- Transform mode on image layers still works (if you have an image layer)
- Undo/redo still works

- [ ] **Step 13: Manual test on phone**

Open the dev server URL on your phone (same WiFi network, use your machine's local IP).

Test in "Touch Draw" mode (set via sidebar):
- Single finger draws a stroke
- Two fingers pinch to zoom in/out
- Two fingers drag to pan
- Starting to draw with one finger, then adding second finger cancels the stroke and starts a gesture

Test in "Stylus Only" mode:
- Single finger pans (no drawing)
- Two fingers pinch-to-zoom

Test in "Auto" mode:
- Single finger draws
- Two fingers gesture

- [ ] **Step 14: Commit**

```bash
git add src/components/drawing-canvas.tsx
git commit -m "feat: refactor drawing-canvas to use InputManager for touch/stylus support"
```

---

### Task 5: Final Integration Test and Cleanup

**Files:**
- Possibly touch: any files from above if issues found

- [ ] **Step 1: End-to-end test checklist**

Verify every item:
- [ ] Desktop mouse: draw, zoom (wheel), pan (space+drag, middle click)
- [ ] Desktop mouse: eraser cursor overlay
- [ ] Desktop mouse: image layer transform (move, resize, rotate)
- [ ] Desktop mouse: undo/redo after drawing
- [ ] Phone touch-draw mode: single finger draws
- [ ] Phone touch-draw mode: two-finger pinch zoom
- [ ] Phone touch-draw mode: two-finger pan
- [ ] Phone touch-draw mode: mid-stroke cancel (start drawing, add second finger)
- [ ] Phone stylus-only mode: single finger pans
- [ ] Phone stylus-only mode: two-finger pinch zoom
- [ ] Phone: touch mode setting persists across page reload
- [ ] Phone: touch mode selector hidden if device has no touch support (verify on desktop — should be hidden unless touch simulation enabled)

- [ ] **Step 2: Fix any issues found**

Address any bugs discovered during testing.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: touch/stylus integration fixes"
```
