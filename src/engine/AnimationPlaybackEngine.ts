/**
 * AnimationPlaybackEngine - Handles timelapse playback for stroke animations
 *
 * This engine manages the playback state and provides methods to:
 * - Play/pause/stop animations
 * - Seek to specific times
 * - Control playback speed
 * - Get visible strokes at any point in time
 * - Get partial strokes for smooth progressive animation
 */

import type { StrokeLike } from "./types";

export type PlaybackState = "stopped" | "playing" | "paused";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface PlaybackInfo {
  state: PlaybackState;
  currentTime: number;
  totalDuration: number;
  speed: PlaybackSpeed;
  progress: number; // 0-1
}

export interface AnimationCallbacks {
  onFrame?: (info: PlaybackInfo, visibleStrokes: StrokeLike[]) => void;
  onStateChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
}

/**
 * Calculate the total animation duration from a set of strokes
 * This is the time from the first stroke's start to the last stroke's end
 */
export function calculateTotalDuration(strokes: StrokeLike[]): number {
  if (strokes.length === 0) return 0;

  // Find strokes that have timing data
  const timedStrokes = strokes.filter(
    (s) => s.startTime != null && s.duration != null
  );

  if (timedStrokes.length === 0) {
    // Fallback: use timestamps if no timing data
    // Assume each stroke takes 500ms
    const timestamps = strokes.map((s) => s.timestamp).sort((a, b) => a - b);
    if (timestamps.length === 0) return 0;
    return timestamps[timestamps.length - 1] - timestamps[0] + 500;
  }

  // Find earliest start and latest end
  let earliestStart = Infinity;
  let latestEnd = -Infinity;

  for (const stroke of timedStrokes) {
    const start = stroke.startTime!;
    const end = start + stroke.duration!;
    if (start < earliestStart) earliestStart = start;
    if (end > latestEnd) latestEnd = end;
  }

  return latestEnd - earliestStart;
}

/**
 * Get the base time (earliest stroke start time) for a set of strokes
 */
export function getBaseTime(strokes: StrokeLike[]): number {
  const timedStrokes = strokes.filter((s) => s.startTime != null);

  if (timedStrokes.length === 0) {
    // Fallback to timestamps
    const timestamps = strokes.map((s) => s.timestamp).sort((a, b) => a - b);
    return timestamps[0] ?? 0;
  }

  return Math.min(...timedStrokes.map((s) => s.startTime!));
}

export class AnimationPlaybackEngine {
  private state: PlaybackState = "stopped";
  private currentTime: number = 0;
  private speed: PlaybackSpeed = 1;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;

  private strokes: StrokeLike[] = [];
  private baseTime: number = 0;
  private totalDuration: number = 0;

  private callbacks: AnimationCallbacks = {};

  constructor(callbacks?: AnimationCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * Set the strokes to animate
   */
  setStrokes(strokes: StrokeLike[]): void {
    this.strokes = strokes;
    this.baseTime = getBaseTime(strokes);
    this.totalDuration = calculateTotalDuration(strokes);
    this.currentTime = 0;
    this.state = "stopped";
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: AnimationCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current playback info
   */
  getPlaybackInfo(): PlaybackInfo {
    return {
      state: this.state,
      currentTime: this.currentTime,
      totalDuration: this.totalDuration,
      speed: this.speed,
      progress:
        this.totalDuration > 0 ? this.currentTime / this.totalDuration : 0,
    };
  }

  /**
   * Start or resume playback
   */
  play(): void {
    if (this.state === "playing") return;
    if (this.strokes.length === 0) return;

    // If stopped, reset to beginning
    if (this.state === "stopped") {
      this.currentTime = 0;
    }

    this.state = "playing";
    this.lastFrameTime = performance.now();
    this.callbacks.onStateChange?.("playing");
    this.tick();
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.state !== "playing") return;

    this.state = "paused";
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onStateChange?.("paused");
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    this.state = "stopped";
    this.currentTime = 0;
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onStateChange?.("stopped");
  }

  /**
   * Seek to a specific time (in milliseconds)
   */
  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.totalDuration));
    this.emitFrame();
  }

  /**
   * Seek to a progress value (0-1)
   */
  seekProgress(progress: number): void {
    this.seek(progress * this.totalDuration);
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
  }

  /**
   * Get currently visible strokes at the current playback time
   * This includes fully visible strokes and partially drawn strokes
   */
  getVisibleStrokes(): StrokeLike[] {
    return this.getStrokesAtTime(this.currentTime);
  }

  /**
   * Get strokes visible at a specific time
   */
  getStrokesAtTime(time: number): StrokeLike[] {
    const result: StrokeLike[] = [];

    for (const stroke of this.strokes) {
      const partial = this.getPartialStroke(stroke, time);
      if (partial) {
        result.push(partial);
      }
    }

    return result;
  }

  /**
   * Get a partial or full stroke based on playback time
   * Returns null if stroke hasn't started yet
   * Returns stroke with partial points if in progress
   * Returns full stroke if complete
   */
  private getPartialStroke(
    stroke: StrokeLike,
    playbackTime: number
  ): StrokeLike | null {
    // Get stroke timing
    const strokeStart = (stroke.startTime ?? stroke.timestamp) - this.baseTime;
    const strokeDuration = stroke.duration ?? 500; // Default 500ms if no duration
    const strokeEnd = strokeStart + strokeDuration;

    // Stroke hasn't started yet
    if (playbackTime < strokeStart) {
      return null;
    }

    // Stroke is fully complete
    if (playbackTime >= strokeEnd) {
      return stroke;
    }

    // Stroke is in progress - calculate partial points
    const progress = (playbackTime - strokeStart) / strokeDuration;
    const pointCount = Math.max(
      1,
      Math.floor(stroke.points.length * progress)
    );

    return {
      ...stroke,
      points: stroke.points.slice(0, pointCount),
    };
  }

  /**
   * Animation loop
   */
  private tick = (): void => {
    if (this.state !== "playing") return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) * this.speed;
    this.lastFrameTime = now;

    this.currentTime += deltaTime;

    // Check if animation is complete
    if (this.currentTime >= this.totalDuration) {
      this.currentTime = this.totalDuration;
      this.emitFrame();
      this.state = "stopped";
      this.callbacks.onStateChange?.("stopped");
      this.callbacks.onComplete?.();
      return;
    }

    this.emitFrame();
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /**
   * Emit a frame callback with current state
   */
  private emitFrame(): void {
    if (this.callbacks.onFrame) {
      const visibleStrokes = this.getVisibleStrokes();
      this.callbacks.onFrame(this.getPlaybackInfo(), visibleStrokes);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.strokes = [];
    this.callbacks = {};
  }
}

export default AnimationPlaybackEngine;
