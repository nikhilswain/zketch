import { elementKind } from "@/engine/types";

export function cloneElements(snaps: any[], dx: number, dy: number, keepOutsideLinks: boolean): any[] {
  const ids = new Map<string, string>();
  for (const s of snaps) ids.set(s.id, crypto.randomUUID());
  const link = (id: string | null | undefined) => {
    if (!id) return null;
    if (ids.has(id)) return ids.get(id)!;
    return keepOutsideLinks ? id : null;
  };
  return snaps.map((s) => {
    const c = { ...s, id: ids.get(s.id) };
    switch (elementKind(s)) {
      case "arrow": {
        const startId = link(s.startBinding?.elementId);
        const endId = link(s.endBinding?.elementId);
        return {
          ...c,
          start: { x: s.start.x + dx, y: s.start.y + dy },
          end: { x: s.end.x + dx, y: s.end.y + dy },
          startBinding: startId ? { elementId: startId } : null,
          endBinding: endId ? { elementId: endId } : null,
        };
      }
      case "text":
        return { ...c, x: s.x + dx, y: s.y + dy, containerId: link(s.containerId) };
      case "shape":
        return { ...c, x: s.x + dx, y: s.y + dy };
      default:
        return { ...c, points: (s.points ?? []).map((p: any) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    }
  });
}
