import Dexie, { type Table } from "dexie";

/**
 *
 */
export interface IStoredBlob {
  id: string;
  blob: Blob;
  mimeType: string;
  originalName?: string;
  width: number;
  height: number;
  size: number;
  createdAt: Date;
}

/**
 * Database for storing image blobs separately from drawings
 * This improves performance by not loading large blobs with drawing metadata
 */
class BlobDatabase extends Dexie {
  blobs!: Table<IStoredBlob>;

  constructor() {
    super("ImageBlobs");

    this.version(1).stores({
      blobs: "id, mimeType, createdAt",
    });
  }
}

/**
 * Service for storing and retrieving image blobs in IndexedDB
 */
export class BlobStorageService {
  private static db = new BlobDatabase();
  private static blobUrlCache = new Map<string, string>();

  /**
   * Generate a unique blob ID
   */
  static generateBlobId(): string {
    return `blob_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Store a blob and return its ID
   */
  static async storeBlob(
    blob: Blob,
    width: number,
    height: number,
    originalName?: string
  ): Promise<string> {
    const id = this.generateBlobId();

    const storedBlob: IStoredBlob = {
      id,
      blob,
      mimeType: blob.type,
      originalName,
      width,
      height,
      size: blob.size,
      createdAt: new Date(),
    };

    await this.db.blobs.put(storedBlob);
    return id;
  }

  /**
   * Retrieve a blob by ID
   */
  static async getBlob(id: string): Promise<IStoredBlob | undefined> {
    return await this.db.blobs.get(id);
  }

  /**
   * Get a blob URL for rendering (cached)
   * Remember to call revokeBlobUrl when done to free memory
   */
  static async getBlobUrl(id: string): Promise<string | null> {
    // Check cache first
    if (this.blobUrlCache.has(id)) {
      return this.blobUrlCache.get(id)!;
    }

    const stored = await this.getBlob(id);
    if (!stored) {
      return null;
    }

    const url = URL.createObjectURL(stored.blob);
    this.blobUrlCache.set(id, url);
    return url;
  }

  /**
   * Revoke a blob URL to free memory
   */
  static revokeBlobUrl(id: string): void {
    const url = this.blobUrlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.blobUrlCache.delete(id);
    }
  }

  /**
   * Revoke all cached blob URLs
   */
  static revokeAllBlobUrls(): void {
    for (const url of this.blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrlCache.clear();
  }

  /**
   * Delete a blob by ID
   */
  static async deleteBlob(id: string): Promise<void> {
    this.revokeBlobUrl(id);
    await this.db.blobs.delete(id);
  }

  /**
   * Delete multiple blobs by IDs
   */
  static async deleteBlobs(ids: string[]): Promise<void> {
    ids.forEach((id) => this.revokeBlobUrl(id));
    await this.db.blobs.bulkDelete(ids);
  }

  /**
   * Check if a blob exists
   */
  static async hasBlob(id: string): Promise<boolean> {
    const count = await this.db.blobs.where("id").equals(id).count();
    return count > 0;
  }

  /**
   * Get all blob IDs (useful for cleanup)
   */
  static async getAllBlobIds(): Promise<string[]> {
    const blobs = await this.db.blobs.toArray();
    return blobs.map((b) => b.id);
  }

  /**
   * Get total storage used by blobs
   */
  static async getTotalBlobSize(): Promise<number> {
    const blobs = await this.db.blobs.toArray();
    return blobs.reduce((total, blob) => total + blob.size, 0);
  }

  /**
   * Get blob count
   */
  static async getBlobCount(): Promise<number> {
    return await this.db.blobs.count();
  }

  /**
   * Clean up orphaned blobs that are not referenced by any drawing
   * @param usedBlobIds - Array of blob IDs that are currently in use
   */
  static async cleanupOrphanedBlobs(usedBlobIds: string[]): Promise<number> {
    const allBlobIds = await this.getAllBlobIds();
    const usedSet = new Set(usedBlobIds);
    const orphanedIds = allBlobIds.filter((id) => !usedSet.has(id));

    if (orphanedIds.length > 0) {
      await this.deleteBlobs(orphanedIds);
    }

    return orphanedIds.length;
  }

  /**
   * Get blob metadata without loading the actual blob data
   */
  static async getBlobMetadata(
    id: string
  ): Promise<Omit<IStoredBlob, "blob"> | null> {
    const stored = await this.db.blobs.get(id);
    if (!stored) {
      return null;
    }

    // Return metadata without the blob
    const { blob: _, ...metadata } = stored;
    return metadata;
  }

  /**
   * Duplicate a blob (for copy operations)
   */
  static async duplicateBlob(id: string): Promise<string | null> {
    const stored = await this.getBlob(id);
    if (!stored) {
      return null;
    }

    return await this.storeBlob(
      stored.blob,
      stored.width,
      stored.height,
      stored.originalName
    );
  }
}
