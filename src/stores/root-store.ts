import { types, type Instance, onPatch } from "mobx-state-tree";
import { CanvasModel } from "../models/CanvasModel";
import { VaultModel } from "../models/VaultModel";
import { SettingsModel } from "../models/SettingsModel";

export const RootStore = types
  .model("RootStore", {
    canvasModel: types.optional(CanvasModel, {}),
    vaultModel: types.optional(VaultModel, {}),
    settingsModel: types.optional(SettingsModel, {}),
  })
  .actions((self) => ({
    afterCreate() {
      // Initialize vault drawings on startup
      self.vaultModel.loadDrawings();
    },
  }));

export interface IRootStore extends Instance<typeof RootStore> {}

export const rootStore = RootStore.create({});

// Auto-increment renderVersion on any visual state change.
// Uses microtask batching so a single user action (e.g., undo which restores
// strokes + background + zoom) only bumps renderVersion once.
const NON_CONTENT_PATHS = [
  "/panX",
  "/panY",
  "/zoom",
  "/currentColor",
  "/currentSize",
  "/eraserSize",
  "/currentBrushStyle",
  "/activeTool",
  "/currentShapeType",
  "/shapeStrokeWidth",
  "/shapeCornerRadius",
  "/shapeOpacity",
  "/shapeFillColor",
  "/colorTarget",
  "/interactionMode",
  "/selectedElements",
  "/selectionAnchor",
];

const isContentPath = (path: string) =>
  !NON_CONTENT_PATHS.some((p) => path === p || path.startsWith(p + "/"));

let renderDirty = false;
let contentDirty = false;
onPatch(rootStore.canvasModel, (patch) => {
  // Skip patches to renderVersion itself (avoid infinite loop)
  if (patch.path.startsWith("/renderVersion")) return;
  // Skip history bookkeeping (not visual state)
  if (patch.path.startsWith("/history")) return;
  if (patch.path.startsWith("/historyIndex")) return;

  if (isContentPath(patch.path)) contentDirty = true;
  if (!renderDirty) {
    renderDirty = true;
    queueMicrotask(() => {
      rootStore.canvasModel.bumpRenderVersion(contentDirty);
      renderDirty = false;
      contentDirty = false;
    });
  }
});

export default rootStore;
