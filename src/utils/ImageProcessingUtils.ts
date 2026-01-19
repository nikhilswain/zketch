/**
 * Image processing configuration
 */
export interface ImageProcessingOptions {
  /** Maximum width for the image (will be scaled down if larger) */
  maxWidth?: number;
  /** Maximum height for the image (will be scaled down if larger) */
  maxHeight?: number;
  /** Maximum file size in bytes (will be compressed if larger) */
  maxFileSize?: number;
  /** Output format for compression */
  outputFormat?: "image/png" | "image/jpeg" | "image/webp";
  /** JPEG/WebP quality (0-1) */
  quality?: number;
}

/**
 * Result of processing an image
 */
export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  wasResized: boolean;
  wasCompressed: boolean;
}

/**
 * Image validation result
 */
export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  size?: number;
}

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * Default processing options
 */
const DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  outputFormat: "image/png",
  quality: 0.92,
};

/**
 * Utility class for image processing operations
 */
export class ImageProcessingUtils {
  /**
   * Check if a MIME type is supported
   */
  static isSupportedType(mimeType: string): mimeType is SupportedImageType {
    return SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType);
  }

  /**
   * Get file extension from MIME type
   */
  static getExtensionFromMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    return extensions[mimeType] || "png";
  }

  /**
   * Load an image from a File or Blob
   */
  static async loadImage(source: File | Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(source);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  /**
   * Load an image from a URL
   */
  static async loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image from URL"));

      img.src = url;
    });
  }

  /**
   * Validate an image file
   */
  static async validateImage(
    file: File | Blob,
  ): Promise<ImageValidationResult> {
    // Check MIME type
    if (!this.isSupportedType(file.type)) {
      return {
        valid: false,
        error: `Unsupported image type: ${file.type}. Supported types: PNG, JPEG, GIF, WebP, SVG`,
      };
    }

    // Check file size (basic limit of 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File too large: ${this.formatFileSize(
          file.size,
        )}. Maximum size: ${this.formatFileSize(maxSize)}`,
      };
    }

    // Try to load the image to verify it's valid
    try {
      const img = await this.loadImage(file);
      return {
        valid: true,
        width: img.naturalWidth,
        height: img.naturalHeight,
        mimeType: file.type,
        size: file.size,
      };
    } catch {
      return {
        valid: false,
        error: "Invalid or corrupted image file",
      };
    }
  }

  /**
   * Calculate dimensions to fit within max bounds while preserving aspect ratio
   */
  static calculateFitDimensions(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number; scale: number } {
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const scale = Math.min(widthRatio, heightRatio, 1); // Don't upscale

    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      scale,
    };
  }

  /**
   * Resize an image to fit within specified dimensions
   */
  static async resizeImage(
    source: HTMLImageElement | File | Blob,
    maxWidth: number,
    maxHeight: number,
    outputFormat: string = "image/png",
    quality: number = 0.92,
  ): Promise<{ blob: Blob; width: number; height: number }> {
    // Load image if needed
    const img =
      source instanceof HTMLImageElement
        ? source
        : await this.loadImage(source);

    const { width, height } = this.calculateFitDimensions(
      img.naturalWidth,
      img.naturalHeight,
      maxWidth,
      maxHeight,
    );

    // Create canvas and draw resized image
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        },
        outputFormat,
        quality,
      );
    });

    return { blob, width, height };
  }

  /**
   * Process an image with full options
   */
  static async processImage(
    source: File | Blob,
    options: ImageProcessingOptions = {},
  ): Promise<ProcessedImage> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Load and validate
    const img = await this.loadImage(source);
    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    // Check if resizing is needed
    const needsResize =
      originalWidth > opts.maxWidth || originalHeight > opts.maxHeight;

    let resultBlob: Blob;
    let resultWidth: number;
    let resultHeight: number;
    let wasResized = false;
    let wasCompressed = false;

    if (needsResize) {
      const resized = await this.resizeImage(
        img,
        opts.maxWidth,
        opts.maxHeight,
        opts.outputFormat,
        opts.quality,
      );
      resultBlob = resized.blob;
      resultWidth = resized.width;
      resultHeight = resized.height;
      wasResized = true;
    } else {
      resultBlob = source;
      resultWidth = originalWidth;
      resultHeight = originalHeight;
    }

    // Check if compression is needed
    if (resultBlob.size > opts.maxFileSize && !wasResized) {
      // Try to compress by converting to JPEG with lower quality
      const compressed = await this.resizeImage(
        img,
        resultWidth,
        resultHeight,
        "image/jpeg",
        0.8,
      );
      if (compressed.blob.size < resultBlob.size) {
        resultBlob = compressed.blob;
        wasCompressed = true;
      }
    }

    return {
      blob: resultBlob,
      width: resultWidth,
      height: resultHeight,
      originalWidth,
      originalHeight,
      wasResized,
      wasCompressed,
    };
  }

  /**
   * Create a thumbnail from an image
   */
  static async createThumbnail(
    source: HTMLImageElement | File | Blob,
    maxWidth: number = 200,
    maxHeight: number = 150,
  ): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
    const { blob, width, height } = await this.resizeImage(
      source,
      maxWidth,
      maxHeight,
      "image/png",
      0.9,
    );

    const dataUrl = await this.blobToDataUrl(blob);

    return { blob, dataUrl, width, height };
  }

  /**
   * Convert a blob to a data URL
   */
  static async blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read blob"));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert a data URL to a Blob
   */
  static dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const base64 = parts[1];
    const byteString = atob(base64);

    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    return new Blob([arrayBuffer], { type: mimeType });
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get image dimensions from a file without fully loading it
   */
  static async getImageDimensions(
    file: File | Blob,
  ): Promise<{ width: number; height: number }> {
    const img = await this.loadImage(file);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  /**
   * Check if an SVG file contains potentially unsafe content
   */
  static async validateSvg(svgBlob: Blob): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const text = await svgBlob.text();

    // Check for script tags
    if (/<script[\s\S]*?>[\s\S]*?<\/script>/i.test(text)) {
      return { valid: false, error: "SVG contains script tags" };
    }

    // Check for event handlers
    if (/on\w+\s*=/i.test(text)) {
      return { valid: false, error: "SVG contains event handlers" };
    }

    // Check for external references that could be dangerous
    if (/javascript:/i.test(text)) {
      return { valid: false, error: "SVG contains javascript: URLs" };
    }

    return { valid: true };
  }

  /**
   * Sanitize an SVG by removing potentially dangerous content
   */
  static async sanitizeSvg(svgBlob: Blob): Promise<Blob> {
    let text = await svgBlob.text();

    // Remove script tags
    text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

    // Remove event handlers
    text = text.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");

    // Remove javascript: URLs
    text = text.replace(/javascript:[^"']*/gi, "");

    return new Blob([text], { type: "image/svg+xml" });
  }
}
