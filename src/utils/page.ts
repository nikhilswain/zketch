import { clampZoom } from "./zoom";

export type Page = { x: number; y: number; width: number; height: number };

export type PagePresetId = "square" | "4x3" | "16x9" | "a4" | "a4-wide" | "story";

export const PAGE_PRESETS: { id: PagePresetId; label: string; width: number; height: number }[] = [
  { id: "square", label: "Square", width: 2048, height: 2048 },
  { id: "4x3", label: "4:3", width: 2048, height: 1536 },
  { id: "16x9", label: "16:9", width: 1920, height: 1080 },
  { id: "a4", label: "A4", width: 2480, height: 3508 },
  { id: "a4-wide", label: "A4 wide", width: 3508, height: 2480 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
];

export const PAGE_MIN = 64;
export const PAGE_MAX = 4096;

export const SURROUND = { light: "#D6D8DC", dark: "#1B1B1E" } as const;
export type SurroundTone = keyof typeof SURROUND;

export function resolveSurround(mode: "auto" | SurroundTone, theme: SurroundTone): SurroundTone {
  return mode === "auto" ? theme : mode;
}

const EXPORT_MAX_AREA = 16_777_216;
const EXPORT_MAX_SIDE = 8192;

export function clampPageSide(n: number): number {
  if (!Number.isFinite(n)) return PAGE_MIN;
  return Math.max(PAGE_MIN, Math.min(PAGE_MAX, Math.round(n)));
}

export function newPage(width: number, height: number): Page {
  return { x: 0, y: 0, width: clampPageSide(width), height: clampPageSide(height) };
}

export function resizePage(page: Page, width: number, height: number): Page {
  const w = clampPageSide(width);
  const h = clampPageSide(height);
  const cx = page.x + page.width / 2;
  const cy = page.y + page.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

export const pageParam = (width: number, height: number) => `${clampPageSide(width)}x${clampPageSide(height)}`;

export function parsePageParam(s: string | null): { width: number; height: number } | null {
  const m = s?.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  return { width: clampPageSide(Number(m[1])), height: clampPageSide(Number(m[2])) };
}

export function exportScaleCap(width: number, height: number): number {
  const byArea = Math.sqrt(EXPORT_MAX_AREA / (width * height));
  const bySide = EXPORT_MAX_SIDE / Math.max(width, height);
  return Math.max(0.05, Math.floor(Math.min(byArea, bySide) * 20) / 20);
}

export function fitPage(page: Page, viewW: number, viewH: number, margin = 48) {
  const zoom = clampZoom(
    Math.min((viewW - margin * 2) / page.width, (viewH - margin * 2) / page.height),
  );
  return {
    zoom,
    panX: viewW / 2 - (page.x + page.width / 2) * zoom,
    panY: viewH / 2 - (page.y + page.height / 2) * zoom,
  };
}

export const pageAspect = (page: Page | null | undefined) => (page ? page.width / page.height : 4 / 3);

export const effectiveExportScale = (scale: number, page: Page | null | undefined) =>
  page ? Math.min(scale, exportScaleCap(page.width, page.height)) : scale;
