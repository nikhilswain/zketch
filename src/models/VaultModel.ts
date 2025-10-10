import { types, type Instance, type SnapshotIn } from "mobx-state-tree";
import { DexieService } from "@/services/DexieService";
import { Stroke } from "./CanvasModel";

// Plain data interfaces for persistence
export interface ISavedDrawingData {
  id: string;
  name: string;
  strokes: Array<{
    id: string;
    points: Array<{
      x: number;
      y: number;
      pressure: number;
    }>;
    color: string;
    size: number;
    brushStyle: string;
    timestamp: number;
  }>;
  thumbnail: string;
  createdAt: Date;
  updatedAt: Date;
  background: string;
}

export const SavedDrawing = types.model("SavedDrawing", {
  id: types.identifier,
  name: types.string,
  strokes: types.array(Stroke),
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
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
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
    replaceDrawingStrokes(
      id: string,
      strokes: SnapshotIn<typeof Stroke>[],
      thumbnail: string,
      background: string
    ) {
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        drawing.strokes.clear();
        strokes.forEach((strokeData) => {
          drawing.strokes.push(Stroke.create(strokeData));
        });
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
            strokes: drawing.strokes.map((stroke) => ({
              id: stroke.id,
              points: stroke.points.map((p) => ({
                x: p.x,
                y: p.y,
                pressure: p.pressure,
              })),
              color: stroke.color,
              size: stroke.size,
              brushStyle: stroke.brushStyle,
              timestamp: stroke.timestamp,
            })),
            thumbnail: drawing.thumbnail,
            createdAt: new Date(drawing.createdAt),
            updatedAt: new Date(drawing.updatedAt),
            background: drawing.background,
          })
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
      strokes: SnapshotIn<typeof Stroke>[],
      thumbnail: string,
      background: string
    ) {
      const drawingData = {
        id: crypto.randomUUID(),
        name,
        strokes,
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
      self.removeDrawingFromList(id);
      try {
        await DexieService.deleteDrawing(id);
        await self.updateStorageInfo();
      } catch (error) {
        console.error("Failed to delete drawing:", error);
      }
    },
    async renameDrawing(id: string, newName: string) {
      self.updateDrawingInList(id, newName);
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        try {
          await DexieService.saveDrawing({
            id: drawing.id,
            name: drawing.name,
            strokes: drawing.strokes.map((stroke) => ({
              id: stroke.id,
              points: stroke.points.map((p) => ({
                x: p.x,
                y: p.y,
                pressure: p.pressure,
              })),
              color: stroke.color,
              size: stroke.size,
              brushStyle: stroke.brushStyle,
              timestamp: stroke.timestamp,
            })),
            thumbnail: drawing.thumbnail,
            createdAt: new Date(drawing.createdAt),
            updatedAt: new Date(drawing.updatedAt),
            background: drawing.background,
          });
          await self.updateStorageInfo();
        } catch (error) {
          console.error("Failed to rename drawing:", error);
        }
      }
    },
    async updateDrawing(
      id: string,
      strokes: SnapshotIn<typeof Stroke>[],
      thumbnail: string,
      background: string
    ) {
      self.replaceDrawingStrokes(id, strokes, thumbnail, background);
      const drawing = self.drawings.find((d) => d.id === id);
      if (drawing) {
        try {
          await DexieService.saveDrawing({
            id: drawing.id,
            name: drawing.name,
            strokes: drawing.strokes.map((stroke) => ({
              id: stroke.id,
              points: stroke.points.map((p) => ({
                x: p.x,
                y: p.y,
                pressure: p.pressure,
              })),
              color: stroke.color,
              size: stroke.size,
              brushStyle: stroke.brushStyle,
              timestamp: stroke.timestamp,
            })),
            thumbnail: drawing.thumbnail,
            createdAt: new Date(drawing.createdAt),
            updatedAt: new Date(drawing.updatedAt),
            background: drawing.background,
          });
          await self.updateStorageInfo();
        } catch (error) {
          console.error("Failed to update drawing:", error);
        }
      }
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
