import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsModel } from "@/models/SettingsModel";
import { resolveSurround } from "@/utils/page";
import { resolveTheme } from "@/utils/theme";

const KEY = "drawing-app-settings";
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
});

const load = (saved?: Record<string, unknown>) => {
  if (saved) store.set(KEY, JSON.stringify(saved));
  return SettingsModel.create({});
};

describe("theme setting", () => {
  it("defaults to light, also for settings saved before themes existed", () => {
    expect(load().theme).toBe("light");
    expect(load({ accent: "#4D8BFF" }).theme).toBe("light");
  });

  it("restores a saved theme and ignores unknown values", () => {
    expect(load({ theme: "dark" }).theme).toBe("dark");
    expect(load({ theme: "system" }).theme).toBe("system");
    expect(load({ theme: "sepia" }).theme).toBe("light");
  });

  it("keeps the saved theme when another stored field is malformed", () => {
    const s = load({ defaultPenSize: "x", theme: "dark", surroundMode: "dark" });
    expect(s.theme).toBe("dark");
    expect(s.surroundMode).toBe("dark");
  });

  it("saves the theme", () => {
    const s = load();
    s.setTheme("dark");
    expect(JSON.parse(store.get(KEY)!).theme).toBe("dark");
  });

  it("resolves system against the OS preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("surround mode", () => {
  it("defaults to auto", () => {
    expect(load().surroundMode).toBe("auto");
  });

  it("migrates the old surround setting: dark stays dark, light becomes auto", () => {
    expect(load({ surround: "dark" }).surroundMode).toBe("dark");
    expect(load({ surround: "light" }).surroundMode).toBe("auto");
  });

  it("prefers surroundMode over the old surround field", () => {
    expect(load({ surround: "dark", surroundMode: "light" }).surroundMode).toBe("light");
  });

  it("saves surroundMode", () => {
    const s = load();
    s.setSurroundMode("dark");
    expect(JSON.parse(store.get(KEY)!).surroundMode).toBe("dark");
  });

  it("auto follows the app theme", () => {
    expect(resolveSurround("auto", "dark")).toBe("dark");
    expect(resolveSurround("auto", "light")).toBe("light");
    expect(resolveSurround("dark", "light")).toBe("dark");
    expect(resolveSurround("light", "dark")).toBe("light");
  });
});
