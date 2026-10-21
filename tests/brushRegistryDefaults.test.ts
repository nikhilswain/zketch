import { describe, expect, it } from "vitest";
import { brushRegistry, registerDefaultBrushes } from "@/engine/render/BrushRegistry";

describe("registerDefaultBrushes", () => {
  it("is idempotent and keeps the same brush instances", () => {
    registerDefaultBrushes();
    const first = brushRegistry.get("ink");
    const count = brushRegistry.keys().length;
    expect(first).toBeDefined();
    registerDefaultBrushes();
    expect(brushRegistry.get("ink")).toBe(first);
    expect(brushRegistry.keys().length).toBe(count);
  });
});
