export interface ShareData {
  name: string;
  data: string; // base64 image data
  timestamp: number;
}

export interface ShareResponse {
  success: boolean;
  shareId?: string;
  shareUrl?: string;
  expiresAt?: string;
  error?: string;
  message?: string;
  size?: number;
  maxSize?: number;
}

export interface RetrieveResponse {
  success: boolean;
  data?: ShareData;
  error?: string;
  message?: string;
}

export class ShareService {
  /**
   * Store a drawing in Cloudflare KV and get a shareable URL
   */
  static async storeSharedDrawing(
    shareData: ShareData
  ): Promise<ShareResponse> {
    try {
      const response = await fetch("/api/share/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(shareData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return result;
    } catch (error) {
      console.error("Failed to store shared drawing:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create share link",
      };
    }
  }

  /**
   * Retrieve a shared drawing by its ID
   */
  static async retrieveSharedDrawing(
    shareId: string
  ): Promise<RetrieveResponse> {
    try {
      const response = await fetch(`/api/share/${shareId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return result;
    } catch (error) {
      console.error("Failed to retrieve shared drawing:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load shared drawing",
        message:
          error instanceof Error
            ? error.message
            : "This shared drawing may have expired or the link is invalid.",
      };
    }
  }

  /**
   * Create a compressed share data object optimized for storage
   */
  static createShareData(name: string, imageData: string): ShareData {
    return {
      name: name.substring(0, 100), // Limit name length
      data: imageData,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if the share data would exceed size limits before attempting to store
   */
  static checkSizeLimit(shareData: ShareData): {
    valid: boolean;
    size: number;
    maxSize: number;
    message?: string;
  } {
    const dataSize = JSON.stringify(shareData).length;
    const maxSize = 20 * 1024 * 1024; // 20MB conservative limit

    if (dataSize > maxSize) {
      return {
        valid: false,
        size: dataSize,
        maxSize: maxSize,
        message: `Drawing is too large to share (${(
          dataSize /
          (1024 * 1024)
        ).toFixed(1)}MB). The limit is ${maxSize / (1024 * 1024)}MB.`,
      };
    }

    return {
      valid: true,
      size: dataSize,
      maxSize: maxSize,
    };
  }

  /**
   * Generate a display-friendly file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
}
