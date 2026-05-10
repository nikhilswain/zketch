export type BrushStyle = "ink" | "eraser" | "spray" | "texture";

// Layer types — draw layers hold mixed elements (strokes + shapes); image is its own layer.
export type LayerType = "draw" | "image";

export type ShapeKind = "rectangle" | "circle" | "diamond" | "triangle";

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
  // Animation timing - auto-captured during drawing
  startTime?: number | null;
  duration?: number | null;
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

// A shape element that lives inside a draw layer.
export interface ShapeElementLike {
  id: string;
  shapeType: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  fillColor: string | null;
  opacity: number;
}

// An element inside a draw layer is either a stroke or a shape element.
export type ElementLike = StrokeLike | ShapeElementLike;

export function isShapeElement(el: ElementLike): el is ShapeElementLike {
  return (el as any).shapeType !== undefined;
}

// Draw layer — holds an ordered mix of stroke and shape elements.
export interface DrawLayerLike extends BaseLayerLike {
  type: "draw";
  elements: readonly ElementLike[];
}

// Image layer
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

// Anything with a transformable bounding box (used by TransformController).
export interface TransformableLayer {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

// Union type for all layer types
export type LayerLike = DrawLayerLike | ImageLayerLike;

// Legacy aliases — used by older call sites; kept so they keep type-checking until migrated.
export type ShapeLayerLike = ShapeElementLike & { type: "shape" };
export type StrokeLayerLike = DrawLayerLike;

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
  // Single-selection accessors (used for transform handles).
  getSelectedLayerId?: () => string | null;
  getSelectedElementId?: () => string | null;
  // Multi-selection accessor — every selected element. Used for outline rendering.
  getSelectedElements?: () => Array<{ layerId: string; elementId: string | null }>;
  // Persistent rotated bbox around the multi-selection. Null when fewer than 2 elements selected.
  getSelectionAnchor?: () => {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null;
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
