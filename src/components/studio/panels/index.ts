import type { FC } from "react";
import type { PanelId } from "@/utils/dockLayout";
import BrushesPanel from "./BrushesPanel";
import PresetsPanel from "./PresetsPanel";
import StrokePanel from "./StrokePanel";
import ColourPanel from "./ColourPanel";
import LayersStudioPanel from "./LayersStudioPanel";
import ShapesPanel from "./ShapesPanel";

export const PANELS: Record<PanelId, { title: string; Component: FC }> = {
  brushes: { title: "Brushes", Component: BrushesPanel },
  presets: { title: "Presets", Component: PresetsPanel },
  stroke: { title: "Stroke", Component: StrokePanel },
  colour: { title: "Colour", Component: ColourPanel },
  layers: { title: "Layers", Component: LayersStudioPanel },
  shapes: { title: "Properties", Component: ShapesPanel },
};
