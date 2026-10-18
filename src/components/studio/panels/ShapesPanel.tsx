import type React from "react";
import ElementProperties from "../ElementProperties";
import PanelFrame from "../PanelFrame";

const ShapesPanel: React.FC = () => (
  <PanelFrame id="shapes" title="Properties">
    <ElementProperties variant="panel" />
  </PanelFrame>
);

export default ShapesPanel;
