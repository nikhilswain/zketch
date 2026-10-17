import { reaction } from "mobx";
import type { ISettingsModel } from "@/models/SettingsModel";
import { setOverlayAccent } from "@/engine/render/overlayColor";

export const ACCENTS = [
  { id: "signal-blue", name: "Signal Blue", hex: "#4D8BFF" },
  { id: "periwinkle", name: "Periwinkle", hex: "#8E9BFF" },
  { id: "ultraviolet", name: "Ultraviolet", hex: "#9B6BFF" },
  { id: "hot-pink", name: "Hot Pink", hex: "#FF4F9A" },
  { id: "coral", name: "Coral", hex: "#FF6B5B" },
];

export const DEFAULT_ACCENT = "#FF6B5B";

export function currentAccent() {
  if (typeof document === "undefined") return DEFAULT_ACCENT;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--zk-accent")
    .trim();
  return value || DEFAULT_ACCENT;
}

export function installAccent(settings: ISettingsModel): () => void {
  return reaction(
    () => settings.accent,
    (hex) => {
      document.documentElement.style.setProperty("--zk-accent", hex);
      setOverlayAccent(hex);
    },
    { fireImmediately: true },
  );
}
