import Dexie, { type Table } from "dexie"
import type { SavedDrawing } from "../models/VaultModel"

export class DrawingDatabase extends Dexie {
  drawings!: Table<SavedDrawing>

  constructor() {
    super("DrawingVault")
    this.version(1).stores({
      drawings: "id, name, createdAt, updatedAt",
    })
  }
}

export class DexieService {
  private static db = new DrawingDatabase()

  static async saveDrawing(drawing: SavedDrawing): Promise<void> {
    await this.db.drawings.put(drawing)
  }

  static async saveAllDrawings(drawings: SavedDrawing[]): Promise<void> {
    await this.db.transaction("rw", this.db.drawings, async () => {
      await this.db.drawings.clear()
      await this.db.drawings.bulkAdd(drawings)
    })
  }

  static async loadAllDrawings(): Promise<SavedDrawing[]> {
    return await this.db.drawings.orderBy("updatedAt").reverse().toArray()
  }

  static async deleteDrawing(id: string): Promise<void> {
    await this.db.drawings.delete(id)
  }

  static async getDrawing(id: string): Promise<SavedDrawing | undefined> {
    return await this.db.drawings.get(id)
  }

  static async getStorageInfo(): Promise<{ used: number; quota: number }> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      }
    }
    return { used: 0, quota: 0 }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }
}
