import Dexie, { type Table } from "dexie";
import { type ISavedDrawingData } from "@/models/VaultModel";

export class DrawingDatabase extends Dexie {
  drawings!: Table<ISavedDrawingData>;

  constructor() {
    super("DrawingVault");
    this.version(1).stores({
      drawings: "id, name, createdAt, updatedAt",
    });
  }
}

export class DexieService {
  private static db = new DrawingDatabase();

  static async saveDrawing(drawing: ISavedDrawingData): Promise<void> {
    await this.db.drawings.put(drawing);
  }

  static async saveAllDrawings(drawings: ISavedDrawingData[]): Promise<void> {
    await this.db.transaction("rw", this.db.drawings, async () => {
      await this.db.drawings.clear();
      await this.db.drawings.bulkAdd(drawings);
    });
  }

  static async loadAllDrawings(): Promise<ISavedDrawingData[]> {
    return await this.db.drawings.orderBy("updatedAt").reverse().toArray();
  }

  static async deleteDrawing(id: string): Promise<void> {
    await this.db.drawings.delete(id);
  }

  static async getDrawing(id: string): Promise<ISavedDrawingData | undefined> {
    return await this.db.drawings.get(id);
  }

  static async getStorageInfo(): Promise<{ used: number; quota: number }> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    return { used: 0, quota: 0 };
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  }
}
