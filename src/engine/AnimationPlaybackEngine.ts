/**
 * AnimationPlaybackEngine - Handles timelapse playback for stroke animations
 *
 * This engine manages the playback state and provides methods to:
 * - Play/pause/stop animations
 * - Seek to specific times
 * - Control playback speed
 * - Get visible strokes at any point in time
 * - Get partial strokes for smooth progressive animation
 * - Compress long gaps between strokes (e.g., overnight pauses)
 */

import type { StrokeLike } from "./types";

export type PlaybackState = "stopped" | "playing" | "paused";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

// ============================================================================
// GAP COMPRESSION SYSTEM
// ============================================================================
//
// Problem: If someone draws, takes a 24-hour break, then draws again,
// we don't want to wait 24 hours during playback!
//
// Solution: Compress any gap longer than `maxGap` down to `maxGap`.
//
// How it works:
// 1. We sort strokes by start time
// 2. We find gaps between strokes (time between one stroke ending and next starting)
// 3. If a gap > maxGap, we record how much time we're "removing"
// 4. During playback, we translate "compressed time" to "original time"
//
// Example:
//   Stroke A: starts at 0ms, duration 1000ms (ends at 1000ms)
//   [GAP: 86,400,000ms = 24 hours]
//   Stroke B: starts at 86,401,000ms
//
//   With maxGap=500ms:
//   - Gap of 24 hours gets compressed to 500ms
//   - Stroke B now appears to start at 1500ms (compressed time)
//   - Total animation: ~2 seconds instead of 24+ hours!
// ============================================================================

/**
 * A keyframe in the compressed timeline.
 * Maps a point in compressed time to original time.
 */
interface TimelineKeyframe {
  /** Time in the compressed timeline (what the user sees) */
  compressedTime: number;
  /** Corresponding time in the original timeline */
  originalTime: number;
}

/**
 * The compressed timeline - maps between compressed and original time.
 * Keyframes are sorted by compressedTime.
 */
interface CompressedTimeline {
  /** Keyframes marking where gaps were compressed */
  keyframes: TimelineKeyframe[];
  /** Total duration after compression */
  compressedDuration: number;
  /** Original duration before compression */
  originalDuration: number;
  /** Whether compression is active */
  isCompressed: boolean;
}

/**
 * Build a compressed timeline from strokes.
 *
 * @param strokes - The strokes to analyze
 * @param baseTime - The earliest stroke start time
 * @param maxGap - Maximum allowed gap (gaps larger than this get compressed)
 * @returns A compressed timeline for time translation
 */
function buildCompressedTimeline(
  strokes: StrokeLike[],
  baseTime: number,
  maxGap: number,
): CompressedTimeline {
  // If no compression requested, return identity timeline
  if (maxGap <= 0 || strokes.length === 0) {
    const duration = calculateTotalDuration(strokes);
    return {
      keyframes: [{ compressedTime: 0, originalTime: 0 }],
      compressedDuration: duration,
      originalDuration: duration,
      isCompressed: false,
    };
  }

  // Get strokes sorted by start time (relative to baseTime)
  const sortedStrokes = [...strokes]
    .filter((s) => s.startTime != null)
    .map((s) => ({
      start: s.startTime! - baseTime,
      end: s.startTime! - baseTime + (s.duration ?? 500),
    }))
    .sort((a, b) => a.start - b.start);

  if (sortedStrokes.length === 0) {
    const duration = calculateTotalDuration(strokes);
    return {
      keyframes: [{ compressedTime: 0, originalTime: 0 }],
      compressedDuration: duration,
      originalDuration: duration,
      isCompressed: false,
    };
  }

  // Build keyframes by finding and compressing gaps
  const keyframes: TimelineKeyframe[] = [
    { compressedTime: 0, originalTime: 0 },
  ];

  let totalTimeRemoved = 0;
  let lastStrokeEnd = sortedStrokes[0].start; // Start from first stroke

  for (const stroke of sortedStrokes) {
    const gapBeforeStroke = stroke.start - lastStrokeEnd;

    // If there's a gap larger than maxGap, compress it
    if (gapBeforeStroke > maxGap) {
      const timeToRemove = gapBeforeStroke - maxGap;
      totalTimeRemoved += timeToRemove;

      // Add a keyframe at the start of this stroke
      // This marks where we "jump" in the timeline
      keyframes.push({
        compressedTime: stroke.start - totalTimeRemoved,
        originalTime: stroke.start,
      });
    }

    // Track where this stroke ends for the next gap calculation
    lastStrokeEnd = Math.max(lastStrokeEnd, stroke.end);
  }

  const originalDuration =
    sortedStrokes.length > 0 ? Math.max(...sortedStrokes.map((s) => s.end)) : 0;
  const compressedDuration = originalDuration - totalTimeRemoved;

  return {
    keyframes,
    compressedDuration,
    originalDuration,
    isCompressed: totalTimeRemoved > 0,
  };
}

/**
 * Convert compressed time to original time.
 * Used during playback to know which strokes should be visible.
 *
 * @param timeline - The compressed timeline
 * @param compressedTime - Time in the compressed timeline
 * @returns Corresponding time in the original timeline
 */
function compressedToOriginal(
  timeline: CompressedTimeline,
  compressedTime: number,
): number {
  if (!timeline.isCompressed) {
    return compressedTime;
  }

  // Find the keyframe just before this compressed time
  // Keyframes are sorted, so we find the last one where compressedTime >= keyframe.compressedTime
  let keyframe = timeline.keyframes[0];

  for (const kf of timeline.keyframes) {
    if (kf.compressedTime <= compressedTime) {
      keyframe = kf;
    } else {
      break;
    }
  }

  // Linear interpolation from that keyframe
  // Time since keyframe in compressed = time since keyframe in original
  const timeSinceKeyframe = compressedTime - keyframe.compressedTime;
  return keyframe.originalTime + timeSinceKeyframe;
}

// ============================================================================
// END GAP COMPRESSION SYSTEM
// ============================================================================

export interface PlaybackInfo {
  state: PlaybackState;
  currentTime: number;
  totalDuration: number;
  speed: PlaybackSpeed;
  progress: number; // 0-1
  loop: boolean;
  /** Original duration before gap compression (only different if compression is active) */
  originalDuration: number;
  /** Whether gap compression is currently active */
  gapCompressionActive: boolean;
}

export interface AnimationOptions {
  /** Loop the animation when it reaches the end */
  loop?: boolean;
  /** Compress gaps between strokes to this max duration (ms). Set to 0 to disable. Default: 500ms */
  maxGap?: number;
}

export interface AnimationCallbacks {
  onFrame?: (info: PlaybackInfo, visibleStrokes: StrokeLike[]) => void;
  onStateChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
  onLoop?: () => void;
}

/**
 * Calculate the total animation duration from a set of strokes
 * This is the time from the first stroke's start to the last stroke's end
 */
export function calculateTotalDuration(strokes: StrokeLike[]): number {
  if (strokes.length === 0) return 0;

  // Find strokes that have timing data
  const timedStrokes = strokes.filter(
    (s) => s.startTime != null && s.duration != null,
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
  private currentTime: number = 0; // This is COMPRESSED time
  private speed: PlaybackSpeed = 1;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private loop: boolean = false;

  private strokes: StrokeLike[] = [];
  private baseTime: number = 0;
  private totalDuration: number = 0; // This is COMPRESSED duration

  // Gap compression
  private maxGap: number = 500; // Default: compress gaps > 500ms
  private timeline: CompressedTimeline = {
    keyframes: [{ compressedTime: 0, originalTime: 0 }],
    compressedDuration: 0,
    originalDuration: 0,
    isCompressed: false,
  };

  private callbacks: AnimationCallbacks = {};

  constructor(callbacks?: AnimationCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * Set the strokes to animate.
   * This will rebuild the compressed timeline.
   */
  setStrokes(strokes: StrokeLike[]): void {
    this.strokes = strokes;
    this.baseTime = getBaseTime(strokes);

    // Build compressed timeline
    this.timeline = buildCompressedTimeline(
      strokes,
      this.baseTime,
      this.maxGap,
    );
    this.totalDuration = this.timeline.compressedDuration;

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
   * Set animation options
   */
  setOptions(options: AnimationOptions): void {
    if (options.loop !== undefined) {
      this.loop = options.loop;
    }
    if (options.maxGap !== undefined) {
      this.setMaxGap(options.maxGap);
    }
  }

  /**
   * Toggle loop mode
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /**
   * Set the maximum gap duration (ms).
   * Gaps longer than this will be compressed down to this value.
   * Set to 0 to disable gap compression.
   * This will rebuild the timeline, so call it before starting playback.
   */
  setMaxGap(maxGap: number): void {
    this.maxGap = maxGap;
    // Rebuild timeline with new maxGap
    if (this.strokes.length > 0) {
      this.timeline = buildCompressedTimeline(
        this.strokes,
        this.baseTime,
        this.maxGap,
      );
      this.totalDuration = this.timeline.compressedDuration;
      // Reset playback position to stay within bounds
      this.currentTime = Math.min(this.currentTime, this.totalDuration);
    }
  }

  /**
   * Get whether gap compression is currently active
   */
  isGapCompressionActive(): boolean {
    return this.timeline.isCompressed;
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
      loop: this.loop,
      originalDuration: this.timeline.originalDuration,
      gapCompressionActive: this.timeline.isCompressed,
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
   * Get strokes visible at a specific compressed time.
   * Internally converts to original time for accurate stroke visibility.
   */
  getStrokesAtTime(compressedTime: number): StrokeLike[] {
    // Convert compressed time to original time
    const originalTime = compressedToOriginal(this.timeline, compressedTime);

    const result: StrokeLike[] = [];

    for (const stroke of this.strokes) {
      const partial = this.getPartialStroke(stroke, originalTime);
      if (partial) {
        result.push(partial);
      }
    }

    return result;
  }

  /**
   * Get a partial or full stroke based on playback time (in ORIGINAL time).
   * Returns null if stroke hasn't started yet
   * Returns stroke with partial points if in progress
   * Returns full stroke if complete
   */
  private getPartialStroke(
    stroke: StrokeLike,
    originalPlaybackTime: number,
  ): StrokeLike | null {
    // Get stroke timing (relative to baseTime, in original time)
    const strokeStart = (stroke.startTime ?? stroke.timestamp) - this.baseTime;
    const strokeDuration = stroke.duration ?? 500; // Default 500ms if no duration
    const strokeEnd = strokeStart + strokeDuration;

    // Stroke hasn't started yet
    if (originalPlaybackTime < strokeStart) {
      return null;
    }

    // Stroke is fully complete
    if (originalPlaybackTime >= strokeEnd) {
      return stroke;
    }

    // Stroke is in progress - calculate partial points
    const progress = (originalPlaybackTime - strokeStart) / strokeDuration;
    const pointCount = Math.max(1, Math.floor(stroke.points.length * progress));

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
      if (this.loop) {
        // Loop back to start
        this.currentTime = 0;
        this.lastFrameTime = performance.now();
        this.callbacks.onLoop?.();
        this.emitFrame();
        this.animationFrameId = requestAnimationFrame(this.tick);
      } else {
        // Stop at end
        this.currentTime = this.totalDuration;
        this.emitFrame();
        this.state = "stopped";
        this.callbacks.onStateChange?.("stopped");
        this.callbacks.onComplete?.();
      }
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
