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
  private gesturePrevCenterX = 0;
  private gesturePrevCenterY = 0;
  private gesturePrevDistance = 0;

  // Gesture start threshold
  private gestureThresholdMet = false;
  private gestureThresholdTimer: number | null = null;
  private static readonly GESTURE_THRESHOLD_PX = 5;
  private static readonly GESTURE_THRESHOLD_MS = 50;

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
    this.root.addEventListener("pointerdown", this.handlePointerDown, {
      passive: false,
    });
    this.root.addEventListener("pointermove", this.handlePointerMove, {
      passive: false,
    });
    this.root.addEventListener("pointerup", this.handlePointerUp, {
      passive: false,
    });
    this.root.addEventListener("pointercancel", this.handlePointerUp, {
      passive: false,
    });
    this.root.addEventListener("pointerleave", this.handlePointerLeave, {
      passive: false,
    });
    // Block browser gestures on touch
    this.root.addEventListener("touchstart", this.preventTouch, {
      passive: false,
    });
    this.root.addEventListener("touchmove", this.preventTouch, {
      passive: false,
    });
    this.root.addEventListener("gesturestart", this.preventGesture, {
      passive: false,
    });
    this.root.addEventListener("gesturechange", this.preventGesture, {
      passive: false,
    });
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
    // Prevent all browser default touch behaviors (scroll, zoom, pull-to-refresh).
    // InputManager handles all touch interactions.
    e.preventDefault();
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

  private getCenter(
    a: TrackedPointer,
    b: TrackedPointer,
  ): { x: number; y: number } {
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
    return (
      movedA > InputManager.GESTURE_THRESHOLD_PX ||
      movedB > InputManager.GESTURE_THRESHOLD_PX
    );
  }

  private initGestureState(a: TrackedPointer, b: TrackedPointer): void {
    const dist = this.getDistance(a, b);
    const center = this.getCenter(a, b);
    this.gesturePrevDistance = dist;
    this.gesturePrevCenterX = center.x;
    this.gesturePrevCenterY = center.y;
    this.gestureActive = true;
    this.gestureThresholdMet = false;
  }

  private computeGestureUpdate(
    a: TrackedPointer,
    b: TrackedPointer,
  ): GestureUpdate {
    const dist = this.getDistance(a, b);
    const center = this.getCenter(a, b);

    const update: GestureUpdate = {
      panDeltaX: center.x - this.gesturePrevCenterX,
      panDeltaY: center.y - this.gesturePrevCenterY,
      zoomDelta:
        this.gesturePrevDistance > 0 ? dist / this.gesturePrevDistance : 1,
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

      // If gesture is already active (e.g., third finger arrived), ignore
      if (this.gestureActive) {
        return;
      }

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
      } else if (
        this.config.getTouchMode() === "stylus-only" &&
        pointer.type === "touch"
      ) {
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

      this.config.callbacks.onDrawMove?.({
        x: e.clientX,
        y: e.clientY,
        pressure: e.pressure || 0.5,
      });

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
        // For single-pointer pan (mouse/pen in pan mode), end when pointer lifts
      } else if (touchCount === 0 && this.activePointers.size === 0) {
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
