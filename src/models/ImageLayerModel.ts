import {
  types,
  type Instance,
  type SnapshotIn,
  type SnapshotOut,
} from "mobx-state-tree";

/**
 * ImageLayer Model - represents an imported image layer
 *
 * Image layers contain a reference to a blob stored in IndexedDB,
 * along with transform properties (position, size, rotation).
 */
export const ImageLayer = types
  .model("ImageLayer", {
    id: types.identifier,
    name: types.string,
    type: types.literal("image"), // Discriminator - always "image"
    visible: types.optional(types.boolean, true),
    locked: types.optional(types.boolean, false),
    opacity: types.optional(types.number, 1), // 0-1

    // Image reference - blob stored separately in IndexedDB
    blobId: types.string,

    // Original image dimensions (before any transforms)
    naturalWidth: types.number,
    naturalHeight: types.number,

    // Transform: position (top-left corner in canvas coordinates)
    x: types.optional(types.number, 0),
    y: types.optional(types.number, 0),

    // Transform: display size
    width: types.number,
    height: types.number,

    // Transform: rotation in degrees
    rotation: types.optional(types.number, 0),

    // Aspect ratio lock
    aspectLocked: types.optional(types.boolean, true),
  })
  .views((self) => ({
    // Get the aspect ratio of the original image
    get aspectRatio() {
      return self.naturalWidth / self.naturalHeight;
    },
    // Get the center point of the image
    get centerX() {
      return self.x + self.width / 2;
    },
    get centerY() {
      return self.y + self.height / 2;
    },
    // Get bounding box (for hit testing)
    get bounds() {
      return {
        left: self.x,
        top: self.y,
        right: self.x + self.width,
        bottom: self.y + self.height,
        width: self.width,
        height: self.height,
      };
    },
  }))
  .actions((self) => ({
    // Visibility & lock
    setName(name: string) {
      self.name = name;
    },
    setVisible(visible: boolean) {
      self.visible = visible;
    },
    toggleVisible() {
      self.visible = !self.visible;
    },
    setLocked(locked: boolean) {
      self.locked = locked;
    },
    toggleLocked() {
      self.locked = !self.locked;
    },
    setOpacity(opacity: number) {
      self.opacity = Math.max(0, Math.min(1, opacity));
    },

    // Transform: position
    setPosition(x: number, y: number) {
      if (self.locked) return;
      self.x = x;
      self.y = y;
    },
    move(dx: number, dy: number) {
      if (self.locked) return;
      self.x += dx;
      self.y += dy;
    },

    // Transform: size
    setSize(width: number, height: number, maintainAspect?: boolean) {
      if (self.locked) return;

      if (maintainAspect ?? self.aspectLocked) {
        // Maintain aspect ratio based on which dimension changed more
        const widthRatio = width / self.width;
        const heightRatio = height / self.height;

        if (Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1)) {
          // Width changed more, adjust height
          self.width = Math.max(10, width);
          self.height = Math.max(10, self.width / self.aspectRatio);
        } else {
          // Height changed more, adjust width
          self.height = Math.max(10, height);
          self.width = Math.max(10, self.height * self.aspectRatio);
        }
      } else {
        self.width = Math.max(10, width);
        self.height = Math.max(10, height);
      }
    },

    // Scale uniformly from center
    scale(factor: number) {
      if (self.locked) return;
      const centerX = self.x + self.width / 2;
      const centerY = self.y + self.height / 2;

      const newWidth = Math.max(10, self.width * factor);
      const newHeight = Math.max(10, self.height * factor);

      self.width = newWidth;
      self.height = newHeight;
      self.x = centerX - newWidth / 2;
      self.y = centerY - newHeight / 2;
    },

    // Transform: rotation
    setRotation(degrees: number) {
      if (self.locked) return;
      // Normalize to 0-360 range
      self.rotation = ((degrees % 360) + 360) % 360;
    },
    rotate(deltaDegrees: number) {
      if (self.locked) return;
      self.rotation = (((self.rotation + deltaDegrees) % 360) + 360) % 360;
    },

    // Aspect lock
    setAspectLocked(locked: boolean) {
      self.aspectLocked = locked;
    },
    toggleAspectLock() {
      self.aspectLocked = !self.aspectLocked;
    },

    // Reset transform to original
    resetTransform(canvasWidth: number, canvasHeight: number) {
      if (self.locked) return;

      // Reset to fit 60-70% of canvas, centered
      const targetSize = Math.min(canvasWidth, canvasHeight) * 0.65;
      const scale = Math.min(
        targetSize / self.naturalWidth,
        targetSize / self.naturalHeight
      );

      self.width = self.naturalWidth * scale;
      self.height = self.naturalHeight * scale;
      self.x = (canvasWidth - self.width) / 2;
      self.y = (canvasHeight - self.height) / 2;
      self.rotation = 0;
    },

    // Update blob reference (for replace image feature)
    updateImage(blobId: string, naturalWidth: number, naturalHeight: number) {
      if (self.locked) return;
      self.blobId = blobId;
      self.naturalWidth = naturalWidth;
      self.naturalHeight = naturalHeight;
    },
  }));

// Type exports
export interface IImageLayer extends Instance<typeof ImageLayer> {}
export interface IImageLayerSnapshot extends SnapshotOut<typeof ImageLayer> {}
export interface IImageLayerSnapshotIn extends SnapshotIn<typeof ImageLayer> {}

// Utility to create a unique image layer ID
export function createImageLayerId(): string {
  return `img_layer_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

// Utility to create a unique blob ID
export function createBlobId(): string {
  return `blob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new image layer with auto-placement
 * @param blobId - Reference to the blob in IndexedDB
 * @param naturalWidth - Original image width
 * @param naturalHeight - Original image height
 * @param canvasWidth - Canvas width for centering
 * @param canvasHeight - Canvas height for centering
 * @param name - Optional layer name
 */
export function createImageLayer(
  blobId: string,
  naturalWidth: number,
  naturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  name?: string
): SnapshotIn<typeof ImageLayer> {
  // Scale to fit 60-70% of canvas
  const targetSize = Math.min(canvasWidth, canvasHeight) * 0.65;
  const scale = Math.min(targetSize / naturalWidth, targetSize / naturalHeight);

  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  // Center on canvas
  const x = (canvasWidth - width) / 2;
  const y = (canvasHeight - height) / 2;

  return {
    id: createImageLayerId(),
    name: name || "Image",
    type: "image",
    visible: true,
    locked: false,
    opacity: 1,
    blobId,
    naturalWidth,
    naturalHeight,
    x,
    y,
    width,
    height,
    rotation: 0,
    aspectLocked: true,
  };
}

export default ImageLayer;
