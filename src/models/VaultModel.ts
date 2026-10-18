import { types, type Instance, type SnapshotIn } from "mobx-state-tree";
import type { ElementLook } from "./ShapeLayerModel";
import { DexieService } from "@/services/DexieService";
import { BlobStorageService } from "@/services/BlobStorageService";
import { Stroke, PageModel } from "./CanvasModel";
import type { Page } from "@/utils/page";

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
  easing?: string;
  angle?: number;
  softness?: number;
  input?: "pen" | "mouse" | "touch" | null;
}

// Legacy stroke-only layer (pre-refactor).
export interface IStrokeLayerData {
  type: "stroke";
  id: string;
  name: string;
  strokes: IStrokeData[];
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// Shape element data inside a draw layer.
export interface IShapeElementData {
  id: string;
  shapeType: "rectangle" | "circle" | "diamond" | "triangle";
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
  look?: ElementLook;
  seed?: number;
}

export interface IArrowElementData {
  id: string;
  kind: "arrow";
  start: { x: number; y: number };
  end: { x: number; y: number };
  bend: number;
  startBinding: { elementId: string } | null;
  endBinding: { elementId: string } | null;
  startHead: "none" | "arrow" | "triangle" | "dot";
  endHead: "none" | "arrow" | "triangle" | "dot";
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  look: ElementLook;
  seed: number;
}

export interface ITextElementData {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontFamily: "hand" | "sans" | "mono";
  fontSize: number;
  align: "left" | "center" | "right";
  color: string;
  opacity: number;
  rotation: number;
  containerId: string | null;
}

// New unified draw layer — holds an ordered mix of stroke and shape elements.
export interface IDrawLayerData {
  type: "draw";
  id: string;
  name: string;
  elements: Array<IStrokeData | IShapeElementData | IArrowElementData | ITextElementData>;
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

export interface IShapeLayerData {
  type: "shape";
  id: string;
  name: string;
  shapeType: "rectangle" | "circle" | "diamond" | "triangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  fillColor: string | null;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// Union type for layer data — old saves use stroke/shape, new saves use draw.
export type ILayerData =
  | IDrawLayerData
  | IStrokeLayerData
  | IImageLayerData
  | IShapeLayerData;

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
  page?: Page;
}

// Saved layer model for MST (stroke layers only - for backward compatibility)
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
  // Layers stored as frozen JSON to support both stroke and image layers
  // This avoids complex MST union types while maintaining flexibility
  layers: types.optional(types.frozen<ILayerData[]>(), []),
  activeLayerId: types.optional(types.string, ""),
  thumbnail: types.string,
  createdAt: types.Date,
  updatedAt: types.Date,
  background: types.string,
  page: types.maybe(PageModel),
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
      page: Page | null = null,
    ) {
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        drawing.page = page ? { ...page } : undefined;
        // Update layers - now stored as frozen JSON, supports both stroke and image layers
        (drawing as any).layers = layers;
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
    async persistDrawing(id: string) {
      const drawing = self.drawings.find((d) => d.id === id);
      if (!drawing) return;
      try {
        await DexieService.saveDrawing({
          id: drawing.id,
          name: drawing.name,
          // Layers are already stored as frozen JSON in the correct format
          layers: drawing.layers as ILayerData[],
          activeLayerId: drawing.activeLayerId,
          thumbnail: drawing.thumbnail,
          createdAt: new Date(drawing.createdAt),
          updatedAt: new Date(drawing.updatedAt),
          background: drawing.background,
          ...(drawing.page
            ? { page: { x: drawing.page.x, y: drawing.page.y, width: drawing.page.width, height: drawing.page.height } }
            : {}),
        });
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
      page: Page | null = null,
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
        ...(page ? { page: { ...page } } : {}),
      };

      self.addDrawingToList(drawingData);
      await self.persistDrawing(drawingData.id);
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
      await self.persistDrawing(id);
      await self.updateStorageInfo();
    },
    async updateDrawing(
      id: string,
      thumbnail: string,
      background: string,
      layers: ILayerData[],
      activeLayerId: string,
      name?: string,
      page: Page | null = null,
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
        page,
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

      await self.persistDrawing(id);
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
