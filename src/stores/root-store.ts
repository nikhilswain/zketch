import { types, type Instance } from "mobx-state-tree";
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

export default rootStore;
