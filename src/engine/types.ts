export type BrushStyle = "ink" | "eraser" | "spray" | "texture";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface StrokeLike {
  id: string;
  points: Point[];
  color: string;
  size: number;
  opacity?: number;
  brushStyle: BrushStyle;
  timestamp: number;
}

export interface LayerLike {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  strokes: readonly StrokeLike[];
}

export interface BrushOptions {
  size: number;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  easing?: (t: number) => number;
  start?: Record<string, unknown>;
  end?: Record<string, unknown>;
}

export interface Brush {
  key: string;
  render(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeLike,
    options?: BrushOptions
  ): void;
}

export interface EngineConfig {
  background: "white" | "transparent" | "grid";
  getStrokes(): StrokeLike[];
  // New: provide layers for multi-layer rendering
  getLayers?: () => LayerLike[];
  // Which layer is currently active (for visual indication)
  getActiveLayerId?: () => string;
  // Optional: provide per-brush rendering options (size, smoothing, taper, etc.)
  getBrushOptions?: (
    brush: BrushStyle,
    size: number
  ) => BrushOptions | undefined;
  onInvalidate?: () => void;
}

export interface PanZoom {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CursorOverlay {
  visible: boolean;
  x?: number;
  y?: number;
  r?: number;
}
