const DB = "DrawingVault";
const STORE = "drawings";

export async function countDrawings(): Promise<number | null> {
  try {
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return null;
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === DB)) return null;
    return await new Promise<number | null>((resolve) => {
      const req = indexedDB.open(DB);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onupgradeneeded = () => {
        req.transaction?.abort();
        resolve(null);
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains(STORE)) {
            db.close();
            resolve(null);
            return;
          }
          const count = db.transaction(STORE, "readonly").objectStore(STORE).count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
    });
  } catch {
    return null;
  }
}

export async function labelVaultLinks(): Promise<void> {
  const n = await countDrawings();
  if (!n) return;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-vault-link]")) a.textContent = `your drawings (${n})`;
}
