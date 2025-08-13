import rootStore from "@/stores/root-store";

export const useCanvasStore = () => rootStore.canvasModel;
export const useVaultStore = () => rootStore.vaultModel;
export const useSettingsStore = () => rootStore.settingsModel;
export const useStore = () => rootStore;
