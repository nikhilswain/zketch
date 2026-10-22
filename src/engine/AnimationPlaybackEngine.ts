import type { ElementLike } from "./types";
import type { ILayerData } from "@/models/VaultModel";
import { buildReplay, progressAt, type Replay } from "@/share/replay";

export type PlaybackState = "stopped" | "playing" | "paused";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8 | 16 | 32;

export interface PlaybackInfo {
  state: PlaybackState;
  currentTime: number;
  totalDuration: number;
  speed: PlaybackSpeed;
  progress: number;
  loop: boolean;
  originalDuration: number;
  gapCompressionActive: boolean;
}

export interface PlaybackElement {
  element: ElementLike;
  progress: number;
}

export interface AnimationOptions {
  loop?: boolean;
  maxGap?: number;
}

export interface AnimationCallbacks {
  onFrame?: (info: PlaybackInfo, frame: PlaybackElement[]) => void;
  onStateChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
  onLoop?: () => void;
}

const EMPTY: Replay = { items: [], total: 0 };

export class AnimationPlaybackEngine {
  private state: PlaybackState = "stopped";
  private currentTime = 0;
  private speed: PlaybackSpeed = 1;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private loop = false;
  private maxGap = 500;
  private elements: ElementLike[] = [];
  private replay: Replay = EMPTY;
  private originalDuration = 0;
  private callbacks: AnimationCallbacks = {};

  constructor(callbacks?: AnimationCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  setElements(elements: ElementLike[]): void {
    this.elements = elements;
    this.rebuild();
    this.currentTime = 0;
    this.state = "stopped";
  }

  private rebuild(): void {
    if (this.elements.length === 0) {
      this.replay = EMPTY;
      this.originalDuration = 0;
      return;
    }
    const layers = [{ type: "draw", visible: true, elements: this.elements }] as unknown as ILayerData[];
    this.replay = buildReplay(layers, this.maxGap);
    this.originalDuration = this.maxGap > 0 ? buildReplay(layers, 0).total : this.replay.total;
  }

  setCallbacks(callbacks: AnimationCallbacks): void {
    this.callbacks = callbacks;
  }

  setOptions(options: AnimationOptions): void {
    if (options.loop !== undefined) this.loop = options.loop;
    if (options.maxGap !== undefined) this.setMaxGap(options.maxGap);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  setMaxGap(maxGap: number): void {
    this.maxGap = maxGap;
    this.rebuild();
    this.currentTime = Math.min(this.currentTime, this.replay.total);
  }

  isGapCompressionActive(): boolean {
    return this.originalDuration > this.replay.total;
  }

  getPlaybackInfo(): PlaybackInfo {
    const total = this.replay.total;
    return {
      state: this.state,
      currentTime: this.currentTime,
      totalDuration: total,
      speed: this.speed,
      progress: total > 0 ? this.currentTime / total : 0,
      loop: this.loop,
      originalDuration: this.originalDuration,
      gapCompressionActive: this.isGapCompressionActive(),
    };
  }

  play(): void {
    if (this.state === "playing" || this.elements.length === 0) return;
    if (this.state === "stopped") this.currentTime = 0;
    this.state = "playing";
    this.lastFrameTime = performance.now();
    this.callbacks.onStateChange?.("playing");
    this.tick();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.cancelFrame();
    this.callbacks.onStateChange?.("paused");
  }

  stop(): void {
    this.state = "stopped";
    this.currentTime = 0;
    this.cancelFrame();
    this.callbacks.onStateChange?.("stopped");
  }

  seek(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.replay.total));
    this.emitFrame();
  }

  seekProgress(progress: number): void {
    this.seek(progress * this.replay.total);
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
  }

  getFrame(): PlaybackElement[] {
    return this.getFrameAt(this.currentTime);
  }

  getFrameAt(time: number): PlaybackElement[] {
    const progress = progressAt(this.replay, time);
    const frame: PlaybackElement[] = [];
    this.elements.forEach((element, i) => {
      const p = progress.get(`0:${i}`);
      if (p !== undefined) frame.push({ element, progress: p });
    });
    return frame;
  }

  private cancelFrame(): void {
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (): void => {
    if (this.state !== "playing") return;
    const now = performance.now();
    this.currentTime += (now - this.lastFrameTime) * this.speed;
    this.lastFrameTime = now;
    const total = this.replay.total;
    if (this.currentTime >= total) {
      if (this.loop) {
        this.currentTime = 0;
        this.lastFrameTime = performance.now();
        this.callbacks.onLoop?.();
        this.emitFrame();
        this.animationFrameId = requestAnimationFrame(this.tick);
      } else {
        this.currentTime = total;
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

  private emitFrame(): void {
    this.callbacks.onFrame?.(this.getPlaybackInfo(), this.getFrame());
  }

  destroy(): void {
    this.cancelFrame();
    this.callbacks = {};
    this.elements = [];
    this.replay = EMPTY;
  }
}

export default AnimationPlaybackEngine;
