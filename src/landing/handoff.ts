import type { StrokeLike } from "@/engine/types";
import type { IDrawLayerData, ISavedDrawingData, IStrokeData } from "@/models/VaultModel";

function toStrokeData(s: StrokeLike): IStrokeData & { startTime: number | null; duration: number | null } {
  return {
    id: s.id,
    points: s.points.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure ?? 0.5 })),
    color: s.color,
    size: s.size,
    opacity: s.opacity ?? 1,
    brushStyle: s.brushStyle,
    timestamp: s.timestamp,
    startTime: s.startTime ?? null,
    duration: s.duration ?? null,
    thinning: s.thinning,
    smoothing: s.smoothing,
    streamline: s.streamline,
    taperStart: s.taperStart,
    taperEnd: s.taperEnd,
    easing: s.easing,
    angle: s.angle,
    softness: s.softness,
    input: s.input ?? null,
    tips: s.tips ?? null,
  };
}

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function padToDrawing(strokes: StrokeLike[], thumbnail: string, now: Date): ISavedDrawingData {
  const layer: IDrawLayerData = {
    type: "draw",
    id: uuid(),
    name: "Layer 1",
    elements: strokes.map(toStrokeData),
    visible: true,
    locked: false,
    opacity: 1,
  };
  return {
    id: uuid(),
    name: "my first doodle",
    layers: [layer],
    activeLayerId: layer.id,
    thumbnail,
    createdAt: now,
    updatedAt: now,
    background: "white",
  };
}

function thumbnailOf(source: HTMLCanvasElement): string {
  const w = 200;
  const h = 150;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const k = Math.max(w / source.width, h / source.height);
  const dw = source.width * k;
  const dh = source.height * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return c.toDataURL("image/png");
}

export async function keepDrawing(strokes: StrokeLike[], canvas: HTMLCanvasElement): Promise<"ok" | "storage-error"> {
  try {
    const drawing = padToDrawing(strokes, thumbnailOf(canvas), new Date());
    const { DexieService } = await import("@/services/DexieService");
    await DexieService.saveDrawing(drawing);
    location.assign(`/draw/${drawing.id}`);
    return "ok";
  } catch (error) {
    console.warn("Could not save the pad drawing", error);
    return "storage-error";
  }
}
