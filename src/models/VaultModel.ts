import { types, type Instance, type SnapshotIn } from "mobx-state-tree";
import { DexieService } from "@/services/DexieService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { Stroke } from "./CanvasModel";

// Stroke data interface for persistence
export interface IStrokeData {
  id: string;
  points: Array<{
    x: number;
    y: number;
    pressure: number;
  }>;
  color: string;
  size: number;
  opacity?: number;
  brushStyle: string;
  timestamp: number;
  // Brush settings per-stroke
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  taperStart?: number;
  taperEnd?: number;
}

// Stroke layer data interface for persistence
export interface IStrokeLayerData {
  type: "stroke";
  id: string;
  name: string;
  strokes: IStrokeData[];
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// Image layer data interface for persistence
export interface IImageLayerData {
  type: "image";
  id: string;
  name: string;
  blobId: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  aspectLocked: boolean;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// Union type for layer data
export type ILayerData = IStrokeLayerData | IImageLayerData;

// Plain data interfaces for persistence
export interface ISavedDrawingData {
  id: string;
  name: string;
  // Layers array (all drawing data is stored in layers)
  layers: ILayerData[];
  activeLayerId: string;
  thumbnail: string;
  createdAt: Date;
  updatedAt: Date;
  background: string;
}

// Saved layer model for MST
export const SavedLayer = types.model("SavedLayer", {
  id: types.identifier,
  name: types.string,
  strokes: types.array(Stroke),
  visible: types.optional(types.boolean, true),
  locked: types.optional(types.boolean, false),
  opacity: types.optional(types.number, 1),
});

export const SavedDrawing = types.model("SavedDrawing", {
  id: types.identifier,
  name: types.string,
  // All drawing data is stored in layers
  layers: types.optional(types.array(SavedLayer), []),
  activeLayerId: types.optional(types.string, ""),
  thumbnail: types.string,
  createdAt: types.Date,
  updatedAt: types.Date,
  background: types.string,
});

export const StorageInfo = types.model("StorageInfo", {
  used: types.optional(types.number, 0),
  quota: types.optional(types.number, 0),
});

export const VaultModel = types
  .model("VaultModel", {
    drawings: types.optional(types.array(SavedDrawing), []),
    isLoading: types.optional(types.boolean, false),
    storageInfo: types.optional(StorageInfo, {}),
  })
  .volatile(() => ({
    // no volatile state yet
  }))
  .views((self) => ({
    get sortedDrawings() {
      return [...self.drawings].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    },
    get isEmpty() {
      return self.drawings.length === 0;
    },
    get storageUsagePercent() {
      if (self.storageInfo.quota === 0) return 0;
      return (self.storageInfo.used / self.storageInfo.quota) * 100;
    },
  }))
  .actions((self) => ({
    setLoading(loading: boolean) {
      self.isLoading = loading;
    },
    setStorageInfo(used: number, quota: number) {
      self.storageInfo.used = used;
      self.storageInfo.quota = quota;
    },
    clearDrawings() {
      self.drawings.clear();
    },
    addDrawingToList(drawingData: SnapshotIn<typeof SavedDrawing>) {
      self.drawings.push(SavedDrawing.create(drawingData));
    },
    removeDrawingFromList(id: string) {
      const index = self.drawings.findIndex((d) => d.id === id);
      if (index !== -1) {
        self.drawings.splice(index, 1);
      }
    },
    updateDrawingInList(id: string, name: string) {
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        drawing.name = name;
        drawing.updatedAt = new Date();
      }
    },
    replaceDrawingLayers(
      id: string,
      thumbnail: string,
      background: string,
      layers: ILayerData[],
      activeLayerId: string,
    ) {
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        // Update layers
        drawing.layers.clear();
        layers.forEach((layerData) => {
          // Only load stroke layers for now - image layers will be handled in Phase 3
          if (layerData.type === "stroke" || !("type" in layerData)) {
            const strokeLayerData = layerData as IStrokeLayerData;
            drawing.layers.push(
              SavedLayer.create({
                id: strokeLayerData.id,
                name: strokeLayerData.name,
                visible: strokeLayerData.visible,
                locked: strokeLayerData.locked,
                opacity: strokeLayerData.opacity,
                strokes: strokeLayerData.strokes as any,
              }),
            );
          }
          // TODO: Handle image layers in Phase 3
        });
        drawing.activeLayerId = activeLayerId || layers[0]?.id || "";

        drawing.thumbnail = thumbnail;
        drawing.background = background;
        drawing.updatedAt = new Date();
      }
    },
    loadDrawing(id: string) {
      return self.drawings.find((d) => d.id === id) || null;
    },
    getDrawingById(id: string) {
      return self.drawings.find((d) => d.id === id) || null;
    },
  }))
  .actions((self) => ({
    async updateStorageInfo() {
      try {
        const info = await DexieService.getStorageInfo();
        self.setStorageInfo(info.used, info.quota);
      } catch (error) {
        console.error("Failed to get storage info:", error);
      }
    },
    async loadFromDB() {
      try {
        self.setLoading(true);
        const drawingsData = await DexieService.loadAllDrawings();
        self.clearDrawings();
        drawingsData.forEach((drawingData) => {
          self.addDrawingToList(drawingData as any);
        });
      } catch (error) {
        console.error("Failed to load from Dexie:", error);
      } finally {
        self.setLoading(false);
      }
    },
    async persistToDB() {
      try {
        const drawingsData: ISavedDrawingData[] = self.drawings.map(
          (drawing) => ({
            id: drawing.id,
            name: drawing.name,
            // Layers data - handle both stroke and image layers
            layers: drawing.layers.map((layer: any) => {
              const baseLayerData = {
                id: layer.id,
                name: layer.name,
                type: layer.type || "stroke",
                visible: layer.visible,
                locked: layer.locked,
                opacity: layer.opacity,
              };

              if (layer.type === "image") {
                return {
                  ...baseLayerData,
                  blobId: layer.blobId,
                  naturalWidth: layer.naturalWidth,
                  naturalHeight: layer.naturalHeight,
                  x: layer.x,
                  y: layer.y,
                  width: layer.width,
                  height: layer.height,
                  rotation: layer.rotation,
                  aspectLocked: layer.aspectLocked,
                };
              }

              return {
                ...baseLayerData,
                strokes: (layer.strokes || []).map((stroke: any) => ({
                  id: stroke.id,
                  points: stroke.points.map((p: any) => ({
                    x: p.x,
                    y: p.y,
                    pressure: p.pressure,
                  })),
                  color: stroke.color,
                  size: stroke.size,
                  opacity: stroke.opacity ?? 1,
                  brushStyle: stroke.brushStyle,
                  timestamp: stroke.timestamp,
                  // Brush settings per-stroke
                  thinning: stroke.thinning,
                  smoothing: stroke.smoothing,
                  streamline: stroke.streamline,
                  taperStart: stroke.taperStart,
                  taperEnd: stroke.taperEnd,
                })),
              };
            }),
            activeLayerId: drawing.activeLayerId,
            thumbnail: drawing.thumbnail,
            createdAt: new Date(drawing.createdAt),
            updatedAt: new Date(drawing.updatedAt),
            background: drawing.background,
          }),
        );
        await DexieService.saveAllDrawings(drawingsData);
      } catch (error) {
        console.error("Failed to persist to Dexie:", error);
      }
    },
  }))
  .actions((self) => ({
    async addDrawing(
      name: string,
      thumbnail: string,
      background: string,
      layers: ILayerData[],
      activeLayerId: string,
    ) {
      const drawingData = {
        id: crypto.randomUUID(),
        name,
        layers: layers || [],
        activeLayerId: activeLayerId || "",
        thumbnail,
        createdAt: new Date(),
        updatedAt: new Date(),
        background,
      };

      self.addDrawingToList(drawingData);
      await self.persistToDB();
      await self.updateStorageInfo();
      return self.drawings.find((d) => d.id === drawingData.id);
    },
    async deleteDrawing(id: string) {
      // Get the drawing before removing to collect blob IDs for cleanup
      const drawing = self.drawings.find((d) => d.id === id);
      const blobsToDelete: string[] = [];

      if (drawing) {
        // Collect thumbnail blob ID if it's a blob reference
        if (BlobStorageService.isThumbnailId(drawing.thumbnail)) {
          blobsToDelete.push(drawing.thumbnail);
        }

        // Collect image layer blob IDs
        drawing.layers.forEach((layer: any) => {
          if (layer.type === "image" && layer.blobId) {
            blobsToDelete.push(layer.blobId);
          }
        });
      }

      // Remove from list
      self.removeDrawingFromList(id);

      try {
        // Delete drawing from database
        await DexieService.deleteDrawing(id);

        // Clean up associated blobs
        if (blobsToDelete.length > 0) {
          await BlobStorageService.deleteBlobs(blobsToDelete);
        }

        await self.updateStorageInfo();
      } catch (error) {
        console.error("Failed to delete drawing:", error);
      }
    },
    async renameDrawing(id: string, newName: string) {
      self.updateDrawingInList(id, newName);
      // Just persist all drawings - the name has been updated in memory
      await self.persistToDB();
      await self.updateStorageInfo();
    },
    async updateDrawing(
      id: string,
      thumbnail: string,
      background: string,
      layers: ILayerData[],
      activeLayerId: string,
      name?: string,
    ) {
      // Get old thumbnail to clean up if it changed
      const drawing = self.drawings.find((d) => d.id === id);
      const oldThumbnail = drawing?.thumbnail;

      // Update name if provided
      if (name !== undefined && drawing) {
        drawing.name = name;
      }

      self.replaceDrawingLayers(
        id,
        thumbnail,
        background,
        layers,
        activeLayerId,
      );

      // Clean up old thumbnail blob if it changed
      if (
        oldThumbnail &&
        oldThumbnail !== thumbnail &&
        BlobStorageService.isThumbnailId(oldThumbnail)
      ) {
        try {
          await BlobStorageService.deleteBlob(oldThumbnail);
        } catch (error) {
          console.error("Failed to delete old thumbnail:", error);
        }
      }

      // Persist all drawings to DB
      await self.persistToDB();
      await self.updateStorageInfo();
    },
    loadDrawing(id: string) {
      return self.drawings.find((d) => d.id === id) || null;
    },
    async getDrawingById(id: string) {
      // First check if it's already loaded in memory
      const existingDrawing = self.drawings.find((d) => d.id === id);
      if (existingDrawing) {
        return existingDrawing;
      }

      // If not in memory, try to load from database
      try {
        const drawingData = await DexieService.getDrawing(id);
        if (drawingData) {
          // Add to memory for future access
          self.addDrawingToList(drawingData as any);
          return self.drawings.find((d) => d.id === id) || null;
        }
        return null;
      } catch (error) {
        console.error("Failed to load drawing from database:", error);
        return null;
      }
    },
    loadDrawings() {
      return self.loadFromDB();
    },
    /**
     * Clean up orphaned blobs that are no longer referenced by any drawing.
     * This can be called periodically or manually to reclaim storage space.
     */
    async cleanupOrphanedBlobs(): Promise<number> {
      // Collect all blob IDs that are currently in use
      const usedBlobIds: string[] = [];

      for (const drawing of self.drawings) {
        // Add thumbnail blob ID if it's a blob reference
        if (BlobStorageService.isThumbnailId(drawing.thumbnail)) {
          usedBlobIds.push(drawing.thumbnail);
        }

        // Add image layer blob IDs
        drawing.layers.forEach((layer: any) => {
          if (layer.type === "image" && layer.blobId) {
            usedBlobIds.push(layer.blobId);
          }
        });
      }

      // Use BlobStorageService to clean up orphans
      const deletedCount =
        await BlobStorageService.cleanupOrphanedBlobs(usedBlobIds);

      if (deletedCount > 0) {
        await self.updateStorageInfo();
        console.log(`Cleaned up ${deletedCount} orphaned blob(s)`);
      }

      return deletedCount;
    },
  }))
  .actions((self) => ({
    afterCreate() {
      // Initialize data loading after creation
      setTimeout(() => {
        self.loadFromDB();
        self.updateStorageInfo();
      }, 0);
    },
  }));

export interface IVaultModel extends Instance<typeof VaultModel> {}
export interface ISavedDrawing extends Instance<typeof SavedDrawing> {}

export default VaultModel;
