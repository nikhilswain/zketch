import type { PanZoom, ImageLayerLike, TransformHandleType } from "./types";

/**
 * Screen point (in CSS pixels, relative to canvas element)
 */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * World point (in canvas/drawing coordinates)
 */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Handle position with screen coordinates for rendering and hit testing
 */
export interface HandlePosition {
  type: TransformHandleType;
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
}

/**
 * Transform state captured at the start of a drag operation
 */
export interface TransformStartState {
  mouseScreenX: number;
  mouseScreenY: number;
  mouseWorldX: number;
  mouseWorldY: number;
  layerX: number;
  layerY: number;
  layerWidth: number;
  layerHeight: number;
  layerRotation: number;
  layerCenterX: number;
  layerCenterY: number;
}

/**
 * Result of applying a transform operation
 */
export interface TransformResult {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Configuration for the TransformController
 */
export interface TransformControllerConfig {
  handleSize?: number; // Size of corner handles in screen pixels
  rotateHandleOffset?: number; // Distance of rotation handle from top edge
  hitTestPadding?: number; // Extra padding for hit testing
}

const DEFAULT_CONFIG: Required<TransformControllerConfig> = {
  handleSize: 10,
  rotateHandleOffset: 25,
  hitTestPadding: 4,
};

/**
 * TransformController handles all coordinate transformations and hit testing
 * for image layer manipulation. It centralizes the math and provides a clean
 * interface for both rendering (CanvasEngine) and interaction (drawing-canvas).
 */
export class TransformController {
  private config: Required<TransformControllerConfig>;

  constructor(config: TransformControllerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // Coordinate Conversion
  // ============================================

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(world: WorldPoint, viewport: PanZoom): ScreenPoint {
    return {
      x: world.x * viewport.zoom + viewport.panX,
      y: world.y * viewport.zoom + viewport.panY,
    };
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screen: ScreenPoint, viewport: PanZoom): WorldPoint {
    return {
      x: (screen.x - viewport.panX) / viewport.zoom,
      y: (screen.y - viewport.panY) / viewport.zoom,
    };
  }

  /**
   * Rotate a point around a center point
   */
  rotatePoint(
    point: ScreenPoint,
    center: ScreenPoint,
    angleRad: number
  ): ScreenPoint {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }

  /**
   * Inverse rotate a point (for hit testing in rotated space)
   */
  unrotatePoint(
    point: ScreenPoint,
    center: ScreenPoint,
    angleRad: number
  ): ScreenPoint {
    return this.rotatePoint(point, center, -angleRad);
  }

  // ============================================
  // Handle Positions
  // ============================================

  /**
   * Get all handle positions for a layer in both screen and world coordinates
   */
  getHandlePositions(
    layer: ImageLayerLike,
    viewport: PanZoom
  ): HandlePosition[] {
    const { x, y, width, height, rotation } = layer;
    const angleRad = (rotation * Math.PI) / 180;

    // Layer center in world coords
    const centerWorld: WorldPoint = {
      x: x + width / 2,
      y: y + height / 2,
    };
    const centerScreen = this.worldToScreen(centerWorld, viewport);

    // Corner positions in world coords (before rotation)
    const cornersWorld = {
      nw: { x, y },
      ne: { x: x + width, y },
      se: { x: x + width, y: y + height },
      sw: { x, y: y + height },
    };

    // Rotation handle position (above top center)
    const rotateWorldY = y - this.config.rotateHandleOffset / viewport.zoom;
    const rotateWorld: WorldPoint = { x: x + width / 2, y: rotateWorldY };

    const handles: HandlePosition[] = [];

    // Add corner handles
    for (const [type, corner] of Object.entries(cornersWorld)) {
      const screenUnrotated = this.worldToScreen(corner, viewport);
      const screenRotated = this.rotatePoint(
        screenUnrotated,
        centerScreen,
        angleRad
      );
      handles.push({
        type: type as TransformHandleType,
        screenX: screenRotated.x,
        screenY: screenRotated.y,
        worldX: corner.x,
        worldY: corner.y,
      });
    }

    // Add rotation handle
    const rotateScreenUnrotated = this.worldToScreen(rotateWorld, viewport);
    const rotateScreenRotated = this.rotatePoint(
      rotateScreenUnrotated,
      centerScreen,
      angleRad
    );
    handles.push({
      type: "rotate",
      screenX: rotateScreenRotated.x,
      screenY: rotateScreenRotated.y,
      worldX: rotateWorld.x,
      worldY: rotateWorld.y,
    });

    return handles;
  }

  /**
   * Get the bounding box corners in screen coordinates (for rendering)
   */
  getBoundingBoxCorners(
    layer: ImageLayerLike,
    viewport: PanZoom
  ): { nw: ScreenPoint; ne: ScreenPoint; se: ScreenPoint; sw: ScreenPoint } {
    const { x, y, width, height, rotation } = layer;
    const angleRad = (rotation * Math.PI) / 180;

    const centerWorld: WorldPoint = { x: x + width / 2, y: y + height / 2 };
    const centerScreen = this.worldToScreen(centerWorld, viewport);

    const corners = {
      nw: this.worldToScreen({ x, y }, viewport),
      ne: this.worldToScreen({ x: x + width, y }, viewport),
      se: this.worldToScreen({ x: x + width, y: y + height }, viewport),
      sw: this.worldToScreen({ x, y: y + height }, viewport),
    };

    // Apply rotation
    return {
      nw: this.rotatePoint(corners.nw, centerScreen, angleRad),
      ne: this.rotatePoint(corners.ne, centerScreen, angleRad),
      se: this.rotatePoint(corners.se, centerScreen, angleRad),
      sw: this.rotatePoint(corners.sw, centerScreen, angleRad),
    };
  }

  // ============================================
  // Hit Testing
  // ============================================

  /**
   * Test if a screen point hits any transform handle
   * Returns the handle type or null if no hit
   */
  hitTest(
    screenPoint: ScreenPoint,
    layer: ImageLayerLike,
    viewport: PanZoom
  ): TransformHandleType | null {
    const handles = this.getHandlePositions(layer, viewport);
    const hitSize = this.config.handleSize + this.config.hitTestPadding;

    // Check rotation handle first (highest priority)
    const rotateHandle = handles.find((h) => h.type === "rotate");
    if (rotateHandle) {
      const dx = screenPoint.x - rotateHandle.screenX;
      const dy = screenPoint.y - rotateHandle.screenY;
      if (dx * dx + dy * dy <= hitSize * hitSize) {
        return "rotate";
      }
    }

    // Check corner handles
    for (const handle of handles) {
      if (handle.type === "rotate") continue;
      const dx = screenPoint.x - handle.screenX;
      const dy = screenPoint.y - handle.screenY;
      if (Math.abs(dx) <= hitSize && Math.abs(dy) <= hitSize) {
        return handle.type;
      }
    }

    // Check if inside bounding box (for move)
    if (this.isPointInRotatedRect(screenPoint, layer, viewport)) {
      return "move";
    }

    return null;
  }

  /**
   * Check if a screen point is inside the rotated bounding box
   */
  private isPointInRotatedRect(
    screenPoint: ScreenPoint,
    layer: ImageLayerLike,
    viewport: PanZoom
  ): boolean {
    const { x, y, width, height, rotation } = layer;
    const angleRad = (rotation * Math.PI) / 180;

    const centerWorld: WorldPoint = { x: x + width / 2, y: y + height / 2 };
    const centerScreen = this.worldToScreen(centerWorld, viewport);

    // Unrotate the test point to axis-aligned space
    const unrotated = this.unrotatePoint(screenPoint, centerScreen, angleRad);

    // Get axis-aligned bounds in screen coords
    const topLeft = this.worldToScreen({ x, y }, viewport);
    const bottomRight = this.worldToScreen(
      { x: x + width, y: y + height },
      viewport
    );

    return (
      unrotated.x >= topLeft.x &&
      unrotated.x <= bottomRight.x &&
      unrotated.y >= topLeft.y &&
      unrotated.y <= bottomRight.y
    );
  }

  // ============================================
  // Transform Operations
  // ============================================

  /**
   * Capture the starting state for a transform operation
   */
  captureStartState(
    mouseScreen: ScreenPoint,
    layer: ImageLayerLike,
    viewport: PanZoom
  ): TransformStartState {
    const mouseWorld = this.screenToWorld(mouseScreen, viewport);
    return {
      mouseScreenX: mouseScreen.x,
      mouseScreenY: mouseScreen.y,
      mouseWorldX: mouseWorld.x,
      mouseWorldY: mouseWorld.y,
      layerX: layer.x,
      layerY: layer.y,
      layerWidth: layer.width,
      layerHeight: layer.height,
      layerRotation: layer.rotation,
      layerCenterX: layer.x + layer.width / 2,
      layerCenterY: layer.y + layer.height / 2,
    };
  }

  /**
   * Apply a move transform
   */
  applyMove(
    currentScreen: ScreenPoint,
    startState: TransformStartState,
    viewport: PanZoom
  ): TransformResult {
    const currentWorld = this.screenToWorld(currentScreen, viewport);
    const deltaX = currentWorld.x - startState.mouseWorldX;
    const deltaY = currentWorld.y - startState.mouseWorldY;

    return {
      x: startState.layerX + deltaX,
      y: startState.layerY + deltaY,
      width: startState.layerWidth,
      height: startState.layerHeight,
      rotation: startState.layerRotation,
    };
  }

  /**
   * Apply a rotation transform
   */
  applyRotation(
    currentScreen: ScreenPoint,
    startState: TransformStartState,
    viewport: PanZoom
  ): TransformResult {
    const currentWorld = this.screenToWorld(currentScreen, viewport);

    // Calculate angles from center
    const startAngle = Math.atan2(
      startState.mouseWorldY - startState.layerCenterY,
      startState.mouseWorldX - startState.layerCenterX
    );
    const currentAngle = Math.atan2(
      currentWorld.y - startState.layerCenterY,
      currentWorld.x - startState.layerCenterX
    );

    // Convert delta to degrees
    const angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
    let newRotation = startState.layerRotation + angleDelta;

    // Normalize to 0-360
    newRotation = ((newRotation % 360) + 360) % 360;

    return {
      x: startState.layerX,
      y: startState.layerY,
      width: startState.layerWidth,
      height: startState.layerHeight,
      rotation: newRotation,
    };
  }

  /**
   * Apply a resize transform from a corner handle
   */
  applyResize(
    handle: "nw" | "ne" | "se" | "sw",
    currentScreen: ScreenPoint,
    startState: TransformStartState,
    viewport: PanZoom,
    maintainAspect: boolean = true
  ): TransformResult {
    const currentWorld = this.screenToWorld(currentScreen, viewport);

    // Calculate delta in world coordinates
    const deltaX = currentWorld.x - startState.mouseWorldX;
    const deltaY = currentWorld.y - startState.mouseWorldY;

    // If there's rotation, we need to transform the delta into the rotated coordinate system
    const angleRad = (startState.layerRotation * Math.PI) / 180;
    const cos = Math.cos(-angleRad);
    const sin = Math.sin(-angleRad);
    const rotatedDeltaX = deltaX * cos - deltaY * sin;
    const rotatedDeltaY = deltaX * sin + deltaY * cos;

    let newX = startState.layerX;
    let newY = startState.layerY;
    let newWidth = startState.layerWidth;
    let newHeight = startState.layerHeight;

    const minSize = 20;

    switch (handle) {
      case "se": // Bottom-right: expand width/height
        newWidth = Math.max(minSize, startState.layerWidth + rotatedDeltaX);
        newHeight = Math.max(minSize, startState.layerHeight + rotatedDeltaY);
        break;

      case "sw": // Bottom-left: move x, shrink width, expand height
        newWidth = Math.max(minSize, startState.layerWidth - rotatedDeltaX);
        newHeight = Math.max(minSize, startState.layerHeight + rotatedDeltaY);
        newX = startState.layerX + (startState.layerWidth - newWidth);
        break;

      case "ne": // Top-right: expand width, move y, shrink height
        newWidth = Math.max(minSize, startState.layerWidth + rotatedDeltaX);
        newHeight = Math.max(minSize, startState.layerHeight - rotatedDeltaY);
        newY = startState.layerY + (startState.layerHeight - newHeight);
        break;

      case "nw": // Top-left: move both, shrink both
        newWidth = Math.max(minSize, startState.layerWidth - rotatedDeltaX);
        newHeight = Math.max(minSize, startState.layerHeight - rotatedDeltaY);
        newX = startState.layerX + (startState.layerWidth - newWidth);
        newY = startState.layerY + (startState.layerHeight - newHeight);
        break;
    }

    // Maintain aspect ratio if requested
    if (maintainAspect) {
      const aspectRatio = startState.layerWidth / startState.layerHeight;
      const newAspect = newWidth / newHeight;

      if (newAspect > aspectRatio) {
        // Width is too large, adjust it
        const adjustedWidth = newHeight * aspectRatio;
        if (handle === "nw" || handle === "sw") {
          newX += newWidth - adjustedWidth;
        }
        newWidth = adjustedWidth;
      } else {
        // Height is too large, adjust it
        const adjustedHeight = newWidth / aspectRatio;
        if (handle === "nw" || handle === "ne") {
          newY += newHeight - adjustedHeight;
        }
        newHeight = adjustedHeight;
      }
    }

    return {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      rotation: startState.layerRotation,
    };
  }

  // ============================================
  // Cursor Styles
  // ============================================

  /**
   * Get the appropriate cursor style for a handle type
   */
  getCursor(handle: TransformHandleType | null): string {
    switch (handle) {
      case "move":
        return "move";
      case "rotate":
        return "alias"; // Rotation cursor
      case "nw":
      case "se":
        return "nwse-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      default:
        return "default";
    }
  }

  // ============================================
  // Rendering Helpers
  // ============================================

  /**
   * Render transform handles on a canvas context
   * This can be called by CanvasEngine for consistent rendering
   *
   * NOTE: The canvas context should already have DPR scaling applied via setTransform.
   * We don't multiply coordinates by DPR here - we only use DPR for line widths.
   */
  renderHandles(
    ctx: CanvasRenderingContext2D,
    layer: ImageLayerLike,
    viewport: PanZoom,
    _dpr: number = 1
  ): void {
    const corners = this.getBoundingBoxCorners(layer, viewport);
    const handles = this.getHandlePositions(layer, viewport);
    const handleSize = this.config.handleSize;

    ctx.save();

    // Use corners directly - canvas already has DPR transform applied
    const { nw, ne, se, sw } = corners;

    // Draw bounding box
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();

    // Draw corner handles
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2;

    for (const handle of handles) {
      if (handle.type === "rotate") continue;

      ctx.beginPath();
      ctx.rect(
        handle.screenX - handleSize / 2,
        handle.screenY - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    }

    // Draw rotation handle
    const rotateHandle = handles.find((h) => h.type === "rotate");
    if (rotateHandle) {
      // Find top center for the line
      const topCenterX = (nw.x + ne.x) / 2;
      const topCenterY = (nw.y + ne.y) / 2;

      // Draw dashed line to rotation handle
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(topCenterX, topCenterY);
      ctx.lineTo(rotateHandle.screenX, rotateHandle.screenY);
      ctx.stroke();

      // Draw rotation handle circle
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(
        rotateHandle.screenX,
        rotateHandle.screenY,
        handleSize / 2 + 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}

// Export singleton instance for convenience
export const transformController = new TransformController();
