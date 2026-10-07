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
let renderDirty = false;
onPatch(rootStore.canvasModel, (patch) => {
  // Skip patches to renderVersion itself (avoid infinite loop)
  if (patch.path.startsWith("/renderVersion")) return;
  // Skip history bookkeeping (not visual state)
  if (patch.path.startsWith("/history")) return;
  if (patch.path.startsWith("/historyIndex")) return;

  if (!renderDirty) {
    renderDirty = true;
    queueMicrotask(() => {
      rootStore.canvasModel.bumpRenderVersion();
      renderDirty = false;
    });
  }
});

export default rootStore;
