import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } from "mediabunny";
import type { ISavedDrawingData } from "@/models/VaultModel";
import { ReplayRenderer, shareFrame } from "./ReplayRenderer";

export type ReplayVideoOptions = {
  drawing: ISavedDrawingData;
  speed: number;
  onProgress: (p: number) => void;
  signal: AbortSignal;
  blobs?: Map<string, Blob>;
};

export type ReplayVideo = { blob: Blob; ext: "mp4" | "webm" };

const FPS = 30;
const MAX_SIDE = 1080;
const HOLD_FRAMES = FPS;
const YIELD_EVERY = 8;
const AVC_CODECS = ["avc1.42E028", "avc1.4D0028", "avc1.640028"];
const WEBM_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

type Stage = {
  renderer: ReplayRenderer;
  source: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  total: number;
};

function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Video cancelled", "AbortError");
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function avcCodec(width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of AVC_CODECS) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, framerate: FPS });
      if (supported) return codec;
    } catch {}
  }
  return null;
}

async function makeStage(drawing: ISavedDrawingData, blobs?: Map<string, Blob>): Promise<Stage> {
  const frame = shareFrame(drawing);
  const scale = MAX_SIDE / Math.max(frame.width, frame.height);
  const source = document.createElement("canvas");
  const renderer = new ReplayRenderer(source, drawing, scale, blobs);
  const canvas = document.createElement("canvas");
  canvas.width = even(source.width);
  canvas.height = even(source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  await renderer.ready();
  return { renderer, source, canvas, ctx, total: renderer.replay.total };
}

function paint(stage: Stage, t: number): void {
  stage.renderer.draw(t);
  stage.ctx.drawImage(stage.source, 0, 0, stage.canvas.width, stage.canvas.height);
}

async function encodeMp4(stage: Stage, codec: string, opts: ReplayVideoOptions): Promise<Blob> {
  const { speed, onProgress, signal } = opts;
  const step = (1000 / FPS) * speed;
  const steps = Math.ceil(stage.total / step);
  const count = steps + 1 + HOLD_FRAMES;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(stage.canvas, { codec: "avc", fullCodecString: codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  await output.start();
  try {
    for (let i = 0; i < count; i++) {
      if (signal.aborted) throw aborted(signal);
      if (i <= steps) paint(stage, Math.min(stage.total, i * step));
      await video.add(i / FPS, 1 / FPS);
      onProgress((i + 1) / count);
      if (i % YIELD_EVERY === 0) await tick();
    }
    if (signal.aborted) throw aborted(signal);
    await output.finalize();
  } catch (err) {
    if (output.state !== "finalized") await output.cancel().catch(() => {});
    throw err;
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("The video came out empty");
  return new Blob([buffer], { type: "video/mp4" });
}

function recordWebm(stage: Stage, opts: ReplayVideoOptions): Promise<Blob> {
  const { speed, onProgress, signal } = opts;
  if (typeof MediaRecorder === "undefined" || typeof stage.canvas.captureStream !== "function") {
    return Promise.reject(new Error("This browser can't make videos"));
  }
  const mimeType = WEBM_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const length = stage.total / speed + (HOLD_FRAMES * 1000) / FPS;
  const stream = stage.canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    let timer = 0;
    let t0 = 0;
    const stop = () => {
      window.clearInterval(timer);
      signal.removeEventListener("abort", onAbort);
      stream.getTracks().forEach((track) => track.stop());
    };
    const onAbort = () => {
      stop();
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      reject(aborted(signal));
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      stop();
      reject(new Error("Recording the video failed"));
    };
    recorder.onstop = () => {
      stop();
      resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort);
    paint(stage, 0);
    recorder.start(1000);
    t0 = performance.now();
    timer = window.setInterval(() => {
      const elapsed = performance.now() - t0;
      paint(stage, Math.min(stage.total, elapsed * speed));
      onProgress(Math.min(1, elapsed / length));
      if (elapsed >= length) {
        window.clearInterval(timer);
        recorder.stop();
      }
    }, 1000 / FPS);
  });
}

export async function makeReplayVideo(opts: ReplayVideoOptions): Promise<ReplayVideo> {
  if (opts.signal.aborted) throw aborted(opts.signal);
  const stage = await makeStage(opts.drawing, opts.blobs);
  try {
    if (opts.signal.aborted) throw aborted(opts.signal);
    const codec = await avcCodec(stage.canvas.width, stage.canvas.height);
    if (codec) {
      try {
        return { blob: await encodeMp4(stage, codec, opts), ext: "mp4" };
      } catch (err) {
        if (opts.signal.aborted) throw err;
        console.error("MP4 encoding failed, recording WebM instead:", err);
        opts.onProgress(0);
      }
    }
    return { blob: await recordWebm(stage, opts), ext: "webm" };
  } finally {
    stage.renderer.dispose();
    stage.source.width = 0;
    stage.source.height = 0;
    stage.canvas.width = 0;
    stage.canvas.height = 0;
  }
}
