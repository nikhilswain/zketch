import type { ISavedDrawing } from "../models/VaultModel"

export class IndexedDBService {
  private static readonly DB_NAME = "DrawingVault"
  private static readonly DB_VERSION = 2
  private static readonly STORE_NAME = "drawings"

  static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Delete old store if it exists
        if (db.objectStoreNames.contains(this.STORE_NAME)) {
          db.deleteObjectStore(this.STORE_NAME)
        }

        // Create new store with updated schema
        const store = db.createObjectStore(this.STORE_NAME, { keyPath: "id" })
        store.createIndex("name", "name", { unique: false })
        store.createIndex("updatedAt", "updatedAt", { unique: false })
        store.createIndex("createdAt", "createdAt", { unique: false })
      }
    })
  }

  static async saveDrawing(drawing: ISavedDrawing): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    const store = transaction.objectStore(this.STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.put(drawing)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  static async saveAllDrawings(drawings: ISavedDrawing[]): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    const store = transaction.objectStore(this.STORE_NAME)

    // Clear existing data
    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear()
      clearRequest.onsuccess = () => resolve()
      clearRequest.onerror = () => reject(clearRequest.error)
    })

    // Add all drawings
    const promises = drawings.map(
      (drawing) =>
        new Promise<void>((resolve, reject) => {
          const request = store.add(drawing)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        }),
    )

    await Promise.all(promises)
  }

  static async loadAllDrawings(): Promise<ISavedDrawing[]> {
    const db = await this.openDB()
    const transaction = db.transaction([this.STORE_NAME], "readonly")
    const store = transaction.objectStore(this.STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const drawings = request.result.map((drawing) => ({
          ...drawing,
          createdAt: new Date(drawing.createdAt),
          updatedAt: new Date(drawing.updatedAt),
        }))
        resolve(drawings)
      }
      request.onerror = () => reject(request.error)
    })
  }

  static async deleteDrawing(id: string): Promise<void> {
    const db = await this.openDB()
    const transaction = db.transaction([this.STORE_NAME], "readwrite")
    const store = transaction.objectStore(this.STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  static async getDrawing(id: string): Promise<ISavedDrawing | null> {
    const db = await this.openDB()
    const transaction = db.transaction([this.STORE_NAME], "readonly")
    const store = transaction.objectStore(this.STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const drawing = request.result
        if (drawing) {
          resolve({
            ...drawing,
            createdAt: new Date(drawing.createdAt),
            updatedAt: new Date(drawing.updatedAt),
          })
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
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
