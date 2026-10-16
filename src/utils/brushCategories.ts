import { brushRegistry } from "@/engine/render/BrushRegistry";
import type { Brush, BrushCategory } from "@/engine/types";

export const BRUSH_CATEGORIES: { id: BrushCategory; label: string }[] = [
  { id: "draw", label: "Draw" },
  { id: "paint", label: "Paint" },
  { id: "texture", label: "Texture" },
  { id: "nature", label: "Nature" },
  { id: "effects", label: "Effects" },
];

export function pickerBrushGroups(): {
  id: BrushCategory;
  label: string;
  brushes: Brush[];
}[] {
  const brushes = brushRegistry.all().filter((b) => !b.legacy);
  return BRUSH_CATEGORIES.map((category) => ({
    ...category,
    brushes: brushes.filter((b) => (b.category ?? "draw") === category.id),
  })).filter((group) => group.brushes.length > 0);
}
