export type BrushStyle = "ink" | "eraser" | "spray" | "texture";

// Layer types
export type LayerType = "stroke" | "image";

// Interaction modes
export type InteractionMode = "draw" | "transform";

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
  // Brush settings stored per-stroke for correct rendering
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  taperStart?: number;
  taperEnd?: number;
}

// Base layer interface (shared properties)
export interface BaseLayerLike {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// Stroke layer - contains drawing strokes
export interface StrokeLayerLike extends BaseLayerLike {
  type: "stroke";
  strokes: readonly StrokeLike[];
}

// Image layer - contains an imported image (to be implemented in Phase 2)
export interface ImageLayerLike extends BaseLayerLike {
  type: "image";
  blobId: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  aspectLocked: boolean;
}

// Union type for all layer types
export type LayerLike = StrokeLayerLike | ImageLayerLike;

// Legacy interface for backward compatibility (deprecated, use LayerLike)
export interface LegacyLayerLike {
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
    options?: BrushOptions,
  ): void;
}

export interface EngineConfig {
  background: "white" | "transparent" | "grid";
  getStrokes(): StrokeLike[];
  // New: provide layers for multi-layer rendering
  getLayers?: () => LayerLike[];
  // Which layer is currently active (for visual indication)
  getActiveLayerId?: () => string;
  // Which layer is selected for transformation
  getSelectedLayerId?: () => string | null;
  // Optional: provide per-brush rendering options (size, smoothing, taper, etc.)
  getBrushOptions?: (
    brush: BrushStyle,
    size: number,
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

// Transform handle types for image manipulation
export type TransformHandleType =
  | "move" // Entire bounding box (for moving)
  | "nw"
  | "ne"
  | "se"
  | "sw" // Corner handles (for resizing)
  | "rotate"; // Rotation handle (top center)

export interface TransformHandles {
  // Bounding box in canvas (world) coordinates
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  // Handle positions in screen coordinates (for hit testing)
  handles: {
    type: TransformHandleType;
    x: number;
    y: number;
    size: number;
  }[];
}
