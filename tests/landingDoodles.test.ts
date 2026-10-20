import { describe, expect, it } from "vitest";
import { DOODLES, autograph, mulberry, pickDoodles, strokeRole } from "@/landing/doodles/library";

const SECTION_IDS = ["paper-stack", "mini-diagram", "padlock", "film-replay", "share-arrow", "brush-jar"];

describe("doodle library", () => {
  it("has at least 16 hero doodles and every section doodle", () => {
    expect(DOODLES.filter((d) => d.hero).length).toBeGreaterThanOrEqual(16);
    const ids = new Set(DOODLES.map((d) => d.id));
    for (const id of SECTION_IDS) expect(ids.has(id)).toBe(true);
  });

  it("every doodle stays inside its box", () => {
    for (const def of DOODLES) {
      for (let seed = 1; seed <= 5; seed++) {
        const d = def.make(seed);
        expect(d.strokes.length).toBeGreaterThan(0);
        for (const s of d.strokes) {
          for (const p of s.points) {
            expect(p.x, `${def.id} x`).toBeGreaterThanOrEqual(-4);
            expect(p.x, `${def.id} x`).toBeLessThanOrEqual(d.w + 4);
            expect(p.y, `${def.id} y`).toBeGreaterThanOrEqual(-4);
            expect(p.y, `${def.id} y`).toBeLessThanOrEqual(d.h + 4);
          }
        }
      }
    }
  });

  it("strokes play in order and duration covers the last stroke", () => {
    for (const def of DOODLES) {
      const d = def.make(2);
      for (let i = 1; i < d.strokes.length; i++) {
        expect(d.strokes[i].startTime!).toBeGreaterThan(d.strokes[i - 1].startTime!);
      }
      const last = d.strokes[d.strokes.length - 1];
      expect(Math.abs(d.duration - (last.startTime! + last.duration!))).toBeLessThanOrEqual(1);
    }
  });

  it("outlines are drawn before fills", () => {
    for (const def of DOODLES) {
      const d = def.make(1);
      const roles = d.strokes.map(strokeRole);
      const lastOutline = roles.lastIndexOf("outline");
      const firstFill = roles.indexOf("fill");
      if (lastOutline >= 0 && firstFill >= 0) expect(lastOutline, def.id).toBeLessThan(firstFill);
    }
  });

  it("is seeded", () => {
    for (const def of DOODLES) {
      expect(def.make(3)).toEqual(def.make(3));
      expect(def.make(3)).not.toEqual(def.make(4));
    }
  });

  it("picks distinct hero doodles with pencil-free ones first", () => {
    const exclude = new Set(["apple"]);
    for (let seed = 1; seed <= 20; seed++) {
      const picks = pickDoodles(7, mulberry(seed), exclude);
      expect(picks).toHaveLength(7);
      expect(new Set(picks.map((p) => p.id)).size).toBe(7);
      for (const p of picks) {
        expect(p.hero).toBe(true);
        expect(exclude.has(p.id)).toBe(false);
      }
      for (const p of picks.slice(0, 2)) {
        expect(p.make(seed).strokes.some((s) => s.brushStyle === "pencil")).toBe(false);
      }
    }
  });

  it("watercolor mode paints every fill with watercolor", () => {
    let fills = 0;
    for (const def of DOODLES) {
      for (const s of def.make(5, "watercolor").strokes) {
        if (strokeRole(s) !== "fill") continue;
        fills++;
        expect(s.brushStyle).toBe("watercolor");
      }
    }
    expect(fills).toBeGreaterThan(10);
  });

  it("autographs are playable doodles", () => {
    const a = autograph("pine", "pine", "#2f6b3a", 7);
    expect(a.strokes.length).toBeGreaterThan(0);
    expect(a.strokes.every((s) => s.brushStyle === "pine")).toBe(true);
    expect(a.duration).toBeGreaterThan(0);
  });
});
