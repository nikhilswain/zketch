export interface SmoothPoint {
  x: number;
  y: number;
  pressure: number;
}

export function smoothPoints(
  points: readonly { x: number; y: number; pressure?: number }[],
  maxPasses = 4,
): SmoothPoint[] {
  let cur: SmoothPoint[] = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure ?? 1,
  }));
  if (cur.length < 5) return cur;
  const passes = Math.min(maxPasses, Math.max(1, Math.floor(cur.length / 8)));
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.map((p) => ({ ...p }));
    for (let i = 1; i < cur.length - 1; i++) {
      next[i].x = (cur[i - 1].x + 2 * cur[i].x + cur[i + 1].x) / 4;
      next[i].y = (cur[i - 1].y + 2 * cur[i].y + cur[i + 1].y) / 4;
      next[i].pressure =
        (cur[i - 1].pressure + 2 * cur[i].pressure + cur[i + 1].pressure) / 4;
    }
    cur = next;
  }
  return cur;
}
