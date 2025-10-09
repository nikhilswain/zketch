import { types, type Instance } from "mobx-state-tree";

export const ExportSettings = types.model("ExportSettings", {
  format: types.optional(
    types.enumeration("ExportFormat", ["png", "jpg", "svg"]),
    "png"
  ),
  quality: types.optional(types.number, 0.9),
  transparentBackground: types.optional(types.boolean, false),
  scale: types.optional(types.number, 1),
});

export const SettingsModel = types
  .model("SettingsModel", {
    // Default drawing settings
    defaultPenSize: types.optional(types.number, 4),
    defaultBrushStyle: types.optional(
      types.enumeration("BrushStyle", ["ink"]),
      "ink"
    ),
    defaultColor: types.optional(types.string, "#000000"),
    defaultBackground: types.optional(
      types.enumeration("BackgroundType", ["white", "transparent", "grid"]),
      "white"
    ),

    // Export preferences
    exportSettings: types.optional(ExportSettings, {}),

    // UI preferences
    autoHideDock: types.optional(types.boolean, true),
    dockHideDelay: types.optional(types.number, 3000),
    showGrid: types.optional(types.boolean, true),
    snapToGrid: types.optional(types.boolean, false),
  })
  .views((self) => ({
    get defaultSettings() {
      return {
        penSize: self.defaultPenSize,
        brushStyle: self.defaultBrushStyle,
        color: self.defaultColor,
        background: self.defaultBackground,
      };
    },
  }))
  .actions((self) => {
    const saveToStorage = () => {
      try {
        const settings = {
          defaultPenSize: self.defaultPenSize,
          defaultBrushStyle: self.defaultBrushStyle,
          defaultColor: self.defaultColor,
          defaultBackground: self.defaultBackground,
          exportSettings: {
            format: self.exportSettings.format,
            quality: self.exportSettings.quality,
            transparentBackground: self.exportSettings.transparentBackground,
            scale: self.exportSettings.scale,
          },
          autoHideDock: self.autoHideDock,
          dockHideDelay: self.dockHideDelay,
          showGrid: self.showGrid,
          snapToGrid: self.snapToGrid,
        };
        localStorage.setItem("drawing-app-settings", JSON.stringify(settings));
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    };

    const loadFromStorage = () => {
      try {
        const stored = localStorage.getItem("drawing-app-settings");
        if (stored) {
          const settings = JSON.parse(stored);
          self.defaultPenSize = settings.defaultPenSize ?? self.defaultPenSize;
          self.defaultBrushStyle =
            settings.defaultBrushStyle ?? self.defaultBrushStyle;
          self.defaultColor = settings.defaultColor ?? self.defaultColor;
          self.defaultBackground =
            settings.defaultBackground ?? self.defaultBackground;
          if (settings.exportSettings) {
            self.exportSettings.format =
              settings.exportSettings.format ?? self.exportSettings.format;
            self.exportSettings.quality =
              settings.exportSettings.quality ?? self.exportSettings.quality;
            self.exportSettings.transparentBackground =
              settings.exportSettings.transparentBackground ??
              self.exportSettings.transparentBackground;
            self.exportSettings.scale =
              settings.exportSettings.scale ?? self.exportSettings.scale;
          }
          self.autoHideDock = settings.autoHideDock ?? self.autoHideDock;
          self.dockHideDelay = settings.dockHideDelay ?? self.dockHideDelay;
          self.showGrid = settings.showGrid ?? self.showGrid;
          self.snapToGrid = settings.snapToGrid ?? self.snapToGrid;
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    return {
      afterCreate() {
        loadFromStorage();
      },
      setDefaults(
        settings: Partial<{
          penSize: number;
          brushStyle: "ink";
          color: string;
          background: "white" | "transparent" | "grid";
        }>
      ) {
        if (settings.penSize !== undefined)
          self.defaultPenSize = settings.penSize;
        if (settings.brushStyle !== undefined)
          self.defaultBrushStyle = settings.brushStyle;
        if (settings.color !== undefined) self.defaultColor = settings.color;
        if (settings.background !== undefined)
          self.defaultBackground = settings.background;
        saveToStorage();
      },
      setExportSettings(
        settings: Partial<{
          format: "png" | "jpg" | "svg";
          quality: number;
          transparentBackground: boolean;
          scale: number;
        }>
      ) {
        if (settings.format !== undefined)
          self.exportSettings.format = settings.format;
        if (settings.quality !== undefined)
          self.exportSettings.quality = settings.quality;
        if (settings.transparentBackground !== undefined)
          self.exportSettings.transparentBackground =
            settings.transparentBackground;
        if (settings.scale !== undefined)
          self.exportSettings.scale = settings.scale;
        saveToStorage();
      },
      setUIPreferences(
        preferences: Partial<{
          autoHideDock: boolean;
          dockHideDelay: number;
          showGrid: boolean;
          snapToGrid: boolean;
        }>
      ) {
        if (preferences.autoHideDock !== undefined)
          self.autoHideDock = preferences.autoHideDock;
        if (preferences.dockHideDelay !== undefined)
          self.dockHideDelay = preferences.dockHideDelay;
        if (preferences.showGrid !== undefined)
          self.showGrid = preferences.showGrid;
        if (preferences.snapToGrid !== undefined)
          self.snapToGrid = preferences.snapToGrid;
        saveToStorage();
      },
    };
  });

// Export type aliases for backward compatibility
export type ExportFormat = "png" | "jpg" | "svg";

export interface ISettingsModel extends Instance<typeof SettingsModel> {}
export interface IExportSettings extends Instance<typeof ExportSettings> {}

export default SettingsModel;
