import { BlobStorageService } from "./BlobStorageService";
import { DexieService } from "./DexieService";
import { backupFileName, packBackup, parseBackup, planImport } from "./BackupService";
import type { ISavedDrawingData } from "@/models/VaultModel";

export async function exportDrawings(ids?: string[]): Promise<number> {
  const all = await DexieService.loadAllDrawings();
  const drawings = ids ? all.filter((d) => ids.includes(d.id)) : all;
  if (drawings.length === 0) return 0;
  const file = await packBackup(drawings, (id) => BlobStorageService.getBlob(id));
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(drawings.length === 1 ? drawings : []);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return drawings.length;
}

export async function importBackupFile(file: File): Promise<{ added: ISavedDrawingData[]; skipped: number }> {
  const backup = parseBackup(await file.text());
  const existing = await DexieService.loadAllDrawings();
  const plan = planImport(
    backup,
    new Map(existing.map((d) => [d.id, new Date(d.updatedAt).getTime()])),
    new Set(await BlobStorageService.getAllBlobIds()),
    (kind) =>
      kind === "drawing"
        ? crypto.randomUUID()
        : kind === "thumb"
          ? BlobStorageService.generateThumbnailId()
          : BlobStorageService.generateBlobId(),
  );
  if (plan.blobs.length) await BlobStorageService.putBlobs(plan.blobs);
  if (plan.drawings.length) await DexieService.saveDrawings(plan.drawings);
  return { added: plan.drawings, skipped: plan.skipped };
}

export async function keepStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    return;
  }
}
