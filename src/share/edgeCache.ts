export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export function edgeCache(): CacheLike | null {
  const storage = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;
  return storage?.default ?? null;
}
