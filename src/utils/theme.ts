import { observable, reaction, runInAction } from "mobx";
import type { ISettingsModel, ThemePreference } from "@/models/SettingsModel";

export type Theme = "light" | "dark";

export const THEME_COLOR: Record<Theme, string> = { light: "#F4F5F7", dark: "#141416" };

const INK: Record<Theme, string> = { light: "#1F2126", dark: "#ECEBE7" };

export const themeState = observable({
  resolved: (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light") as Theme,
});

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function themeInk(): string {
  return INK[themeState.resolved];
}

export function installTheme(settings: ISettingsModel): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const theme = resolveTheme(settings.theme, media.matches);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
    runInAction(() => {
      themeState.resolved = theme;
    });
  };
  const dispose = reaction(() => settings.theme, apply, { fireImmediately: true });
  media.addEventListener("change", apply);
  return () => {
    dispose();
    media.removeEventListener("change", apply);
  };
}
