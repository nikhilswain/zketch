import { BlobStorageService } from "./BlobStorageService";
import {
  ImageProcessingUtils,
  type ImageProcessingOptions,
  type ProcessedImage,
  type ImageValidationResult,
} from "@/utils/ImageProcessingUtils";

/**
 * Import result containing all necessary info for creating an image layer
 */
export interface ImportResult {
  success: boolean;
  blobId?: string;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  fileName?: string;
  error?: string;
}

/**
 * Options for importing images
 */
export interface ImportOptions extends ImageProcessingOptions {
  /** Custom name for the layer */
  layerName?: string;
  /** Whether to center the image on the canvas */
  centerOnCanvas?: boolean;
  /** Canvas dimensions for centering calculation */
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Default import options
 */
const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  centerOnCanvas: true,
};

/**
 * Service for importing images into the canvas
 */
export class ImportService {
  /**
   * Import an image from a File
   */
  static async importFromFile(
    file: File,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };

    try {
      // Validate the image first
      const validation = await ImageProcessingUtils.validateImage(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Process the image (resize if needed)
      const processed = await ImageProcessingUtils.processImage(file, opts);

      // Store the blob
      const blobId = await BlobStorageService.storeBlob(
        processed.blob,
        processed.width,
        processed.height,
        file.name
      );

      return {
        success: true,
        blobId,
        width: processed.width,
        height: processed.height,
        originalWidth: processed.originalWidth,
        originalHeight: processed.originalHeight,
        fileName: file.name,
      };
    } catch (error) {
      console.error("Import failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  }

  /**
   * Import multiple images from Files
   */
  static async importFromFiles(
    files: FileList | File[],
    options: ImportOptions = {}
  ): Promise<ImportResult[]> {
    const results: ImportResult[] = [];

    for (const file of Array.from(files)) {
      const result = await this.importFromFile(file, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Import an image from a URL
   */
  static async importFromUrl(
    url: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };

    try {
      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch image: ${response.statusText}`,
        };
      }

      const blob = await response.blob();

      // Check if it's a valid image type
      if (!ImageProcessingUtils.isSupportedType(blob.type)) {
        return {
          success: false,
          error: `Unsupported image type: ${blob.type}`,
        };
      }

      // Validate the image
      const validation = await ImageProcessingUtils.validateImage(blob);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Process the image
      const processed = await ImageProcessingUtils.processImage(blob, opts);

      // Extract filename from URL
      const fileName = this.extractFileNameFromUrl(url);

      // Store the blob
      const blobId = await BlobStorageService.storeBlob(
        processed.blob,
        processed.width,
        processed.height,
        fileName
      );

      return {
        success: true,
        blobId,
        width: processed.width,
        height: processed.height,
        originalWidth: processed.originalWidth,
        originalHeight: processed.originalHeight,
        fileName,
      };
    } catch (error) {
      console.error("Import from URL failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  }

  /**
   * Import an image from clipboard data
   */
  static async importFromClipboard(
    clipboardData: DataTransfer,
    options: ImportOptions = {}
  ): Promise<ImportResult | null> {
    // Look for image items in clipboard
    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));

    if (!imageItem) {
      return null; // No image in clipboard
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return { success: false, error: "Failed to get image from clipboard" };
    }

    return this.importFromFile(file, {
      ...options,
      layerName: options.layerName || "Pasted Image",
    });
  }

  /**
   * Import an image from a data URL
   */
  static async importFromDataUrl(
    dataUrl: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    try {
      const blob = ImageProcessingUtils.dataUrlToBlob(dataUrl);

      // Validate the image
      const validation = await ImageProcessingUtils.validateImage(blob);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Process the image
      const processed = await ImageProcessingUtils.processImage(blob, options);

      // Store the blob
      const blobId = await BlobStorageService.storeBlob(
        processed.blob,
        processed.width,
        processed.height,
        options.layerName || "Imported Image"
      );

      return {
        success: true,
        blobId,
        width: processed.width,
        height: processed.height,
        originalWidth: processed.originalWidth,
        originalHeight: processed.originalHeight,
      };
    } catch (error) {
      console.error("Import from data URL failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  }

  /**
   * Handle drag and drop of files
   */
  static async handleDrop(
    event: DragEvent,
    options: ImportOptions = {}
  ): Promise<ImportResult[]> {
    event.preventDefault();

    const results: ImportResult[] = [];

    if (!event.dataTransfer) {
      return results;
    }

    // Check for files
    if (event.dataTransfer.files.length > 0) {
      const fileResults = await this.importFromFiles(
        event.dataTransfer.files,
        options
      );
      results.push(...fileResults);
    }

    // Check for URL (dragged from browser)
    const url =
      event.dataTransfer.getData("text/uri-list") ||
      event.dataTransfer.getData("text/plain");

    if (url && this.isImageUrl(url)) {
      const urlResult = await this.importFromUrl(url, options);
      results.push(urlResult);
    }

    return results;
  }

  /**
   * Create a file input and trigger it
   */
  static openFilePicker(
    onSelect: (files: FileList) => void,
    multiple: boolean = true
  ): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
    input.multiple = multiple;

    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        onSelect(input.files);
      }
    };

    input.click();
  }

  /**
   * Delete a blob and clean up resources
   */
  static async deleteBlob(blobId: string): Promise<void> {
    await BlobStorageService.deleteBlob(blobId);
  }

  /**
   * Get a blob URL for rendering
   */
  static async getBlobUrl(blobId: string): Promise<string | null> {
    return BlobStorageService.getBlobUrl(blobId);
  }

  /**
   * Revoke a blob URL to free memory
   */
  static revokeBlobUrl(blobId: string): void {
    BlobStorageService.revokeBlobUrl(blobId);
  }

  /**
   * Extract filename from URL
   */
  private static extractFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const segments = pathname.split("/");
      const lastSegment = segments[segments.length - 1];

      // Remove query params if any
      const fileName = lastSegment.split("?")[0];

      return fileName || "imported-image";
    } catch {
      return "imported-image";
    }
  }

  /**
   * Check if a URL looks like an image URL
   */
  private static isImageUrl(url: string): boolean {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return false;
    }

    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
    const lowerUrl = url.toLowerCase();

    return imageExtensions.some((ext) => lowerUrl.includes(ext));
  }
}
