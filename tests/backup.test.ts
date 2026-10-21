import { describe, expect, it } from "vitest";
import { backupFileName, packBackup, parseBackup, planImport } from "@/services/BackupService";
import type { ISavedDrawingData } from "@/models/VaultModel";
import type { IStoredBlob } from "@/services/BlobStorageService";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 7]);

const stored = (id: string): IStoredBlob => ({
  id,
  blob: new Blob([png], { type: "image/png" }),
  mimeType: "image/png",
  originalName: "cat.png",
  width: 40,
  height: 30,
  size: png.length,
  createdAt: new Date("2026-10-01T10:00:00Z"),
});

const drawing = (id: string, updated = "2026-10-20T12:00:00Z"): ISavedDrawingData => ({
  id,
  name: "Cat",
  thumbnail: `thumb_${id}`,
  activeLayerId: "l1",
  background: "white",
  createdAt: new Date("2026-10-19T09:00:00Z"),
  updatedAt: new Date(updated),
  page: { x: 0, y: 0, width: 800, height: 600 },
  layers: [
    {
      type: "draw",
      id: "l1",
      name: "Layer 1",
      visible: true,
      locked: false,
      opacity: 1,
      elements: [
        { id: "s1", points: [{ x: 1, y: 2, pressure: 0.5 }], color: "#000", size: 5, brushStyle: "ink", timestamp: 1 },
      ],
    },
    {
      type: "image",
      id: "l2",
      name: "Photo",
      blobId: `blob_${id}`,
      naturalWidth: 40,
      naturalHeight: 30,
      x: 0,
      y: 0,
      width: 40,
      height: 30,
      rotation: 0,
      aspectLocked: true,
      visible: true,
      locked: false,
      opacity: 1,
    },
  ],
});

const roundTrip = async (drawings: ISavedDrawingData[]) => {
  const file = await packBackup(drawings, async (id) => stored(id));
  return parseBackup(JSON.stringify(file));
};

let n = 0;
const fresh = (kind: string) => `${kind}_new${++n}`;

describe("zketch backup files", () => {
  it("round-trips a drawing with its layers, dates, thumbnail and image bytes", async () => {
    const back = await roundTrip([drawing("a")]);
    expect(back.drawings).toHaveLength(1);
    const d = back.drawings[0];
    expect(d.layers).toEqual(drawing("a").layers);
    expect(d.page).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(d.updatedAt).toBeInstanceOf(Date);
    expect(d.updatedAt.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(back.blobs.map((b) => b.id).sort()).toEqual(["blob_a", "thumb_a"]);
    const bytes = new Uint8Array(await back.blobs[0].blob.arrayBuffer());
    expect([...bytes]).toEqual([...png]);
    expect(back.blobs[0].blob.type).toBe("image/png");
  });

  it("rejects files that aren't zketch backups", () => {
    expect(() => parseBackup("not json")).toThrow("isn't a zketch file");
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow("isn't a zketch file");
    expect(() => parseBackup(JSON.stringify({ format: "zketch", version: 99, drawings: [], blobs: [] }))).toThrow("newer version");
  });

  it("adds new drawings as they are", async () => {
    const plan = planImport(await roundTrip([drawing("a")]), new Map(), new Set(), fresh);
    expect(plan.skipped).toBe(0);
    expect(plan.drawings[0].id).toBe("a");
    expect(plan.drawings[0].name).toBe("Cat");
    expect(plan.blobs.map((b) => b.id).sort()).toEqual(["blob_a", "thumb_a"]);
  });

  it("skips a drawing that is already here unchanged", async () => {
    const plan = planImport(
      await roundTrip([drawing("a")]),
      new Map([["a", new Date("2026-10-20T12:00:00Z").getTime()]]),
      new Set(["blob_a", "thumb_a"]),
      fresh,
    );
    expect(plan.skipped).toBe(1);
    expect(plan.drawings).toHaveLength(0);
    expect(plan.blobs).toHaveLength(0);
  });

  it("imports a changed drawing as a copy with its own images, never overwriting", async () => {
    const plan = planImport(
      await roundTrip([drawing("a", "2026-10-21T08:00:00Z")]),
      new Map([["a", new Date("2026-10-20T12:00:00Z").getTime()]]),
      new Set(["blob_a", "thumb_a"]),
      fresh,
    );
    const d = plan.drawings[0];
    expect(d.id).not.toBe("a");
    expect(d.name).toBe("Cat (copy)");
    const image = d.layers.find((l) => l.type === "image");
    expect(image && image.type === "image" && image.blobId).not.toBe("blob_a");
    expect(d.thumbnail).not.toBe("thumb_a");
    expect(d.thumbnail.startsWith("thumb_")).toBe(true);
    expect(plan.blobs.map((b) => b.id).sort()).toEqual([image && image.type === "image" ? image.blobId : "", d.thumbnail].sort());
  });

  it("names single-drawing files after the drawing and full backups by date", () => {
    expect(backupFileName([{ name: 'My: "cat"' }])).toBe("My cat.zketch");
    expect(backupFileName([])).toMatch(/^zketch-backup-\d{4}-\d{2}-\d{2}\.zketch$/);
  });
});
