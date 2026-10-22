type Run = () => void | Promise<void>;

const pending = new Map<string, { run: Run; timer: ReturnType<typeof setTimeout> }>();

async function fire(id: string): Promise<void> {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  await entry.run();
}

function fireLogged(id: string): Promise<void> {
  return fire(id).catch((error) => console.error("Pending delete failed:", error));
}

export function schedule(id: string, run: Run, ms: number) {
  const existing = pending.get(id);
  if (existing) clearTimeout(existing.timer);
  pending.set(id, { run, timer: setTimeout(() => fireLogged(id), ms) });
}

export function undo(id: string): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  clearTimeout(entry.timer);
  return true;
}

export function flush(id: string): Promise<void> {
  return fireLogged(id);
}

export async function flushAll(): Promise<void> {
  await Promise.all([...pending.keys()].map(fireLogged));
}
