import type React from "react";
import ToolSettingsIcon from "@/icons/ToolSettingsIcon";
import ShapeSettingsIcon from "@/icons/ShapeSettingsIcon";
import PaletteIcon from "@/icons/PaletteIcon";
import BackgroundIcon from "@/icons/BackgroundIcon";
import TouchModeIcon from "@/icons/TouchModeIcon";
import ImportIcon from "@/icons/ImportIcon";
import ExportIcon from "@/icons/ExportIcon";

interface IconBarProps {
  openPanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
  onImport: () => void;
  onExport: () => void;
}

const hasTouchSupport =
  typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

interface IconButtonProps {
  isActive: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({
  isActive,
  onClick,
  title,
  children,
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
      isActive
        ? "bg-blue-50 text-blue-600"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`}
  >
    {children}
  </button>
);

const IconBar: React.FC<IconBarProps> = ({
  openPanels,
  onTogglePanel,
  onImport,
  onExport,
}) => {
  return (
    <div className="fixed top-0 left-0 h-full w-12 bg-white/90 backdrop-blur-sm border-r border-gray-200 flex flex-col items-center py-4 gap-1 z-10">
      <IconButton
        isActive={openPanels.has("tool-settings")}
        onClick={() => onTogglePanel("tool-settings")}
        title="Tool Settings"
      >
        <ToolSettingsIcon width={20} height={20} />
      </IconButton>

      <IconButton
        isActive={openPanels.has("shape-settings")}
        onClick={() => onTogglePanel("shape-settings")}
        title="Shape Settings"
      >
        <ShapeSettingsIcon width={20} height={20} />
      </IconButton>

      <IconButton
        isActive={openPanels.has("color")}
        onClick={() => onTogglePanel("color")}
        title="Color Palette"
      >
        <PaletteIcon width={20} height={20} />
      </IconButton>

      <IconButton
        isActive={openPanels.has("background")}
        onClick={() => onTogglePanel("background")}
        title="Background"
      >
        <BackgroundIcon width={20} height={20} />
      </IconButton>

      {hasTouchSupport && (
        <IconButton
          isActive={openPanels.has("touch-mode")}
          onClick={() => onTogglePanel("touch-mode")}
          title="Touch Mode"
        >
          <TouchModeIcon width={20} height={20} />
        </IconButton>
      )}

      <div className="w-6 border-t border-gray-200 my-1" />

      <IconButton isActive={false} onClick={onImport} title="Import Image">
        <ImportIcon width={20} height={20} />
      </IconButton>

      <IconButton isActive={false} onClick={onExport} title="Export">
        <ExportIcon width={20} height={20} />
      </IconButton>
    </div>
  );
};

export default IconBar;
