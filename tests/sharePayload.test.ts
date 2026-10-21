import { describe, expect, it } from "vitest";
import { buildShareFile, stripForShare } from "@/share/sharePayload";
import { parseBackup } from "@/services/BackupService";
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

const imageLayer = (id: string, blobId: string, visible: boolean) => ({
  type: "image" as const,
  id,
  name: "Photo",
  blobId,
  naturalWidth: 40,
  naturalHeight: 30,
  x: 0,
  y: 0,
  width: 40,
  height: 30,
  rotation: 0,
  aspectLocked: true,
  visible,
  locked: false,
  opacity: 1,
});

const drawLayer = (id: string, visible: boolean) => ({
  type: "draw" as const,
  id,
  name: id,
  visible,
  locked: false,
  opacity: 1,
  elements: [
    { id: `s_${id}`, points: [{ x: 1, y: 2, pressure: 0.5 }], color: "#000", size: 5, brushStyle: "ink", timestamp: 1 },
  ],
});

const drawing = (layers: ISavedDrawingData["layers"], activeLayerId: string): ISavedDrawingData => ({
  id: "local-1",
  name: "Cat",
  thumbnail: "thumb_local-1",
  activeLayerId,
  background: "white",
  createdAt: new Date("2026-10-19T09:00:00Z"),
  updatedAt: new Date("2026-10-20T12:00:00Z"),
  page: { x: 0, y: 0, width: 800, height: 600 },
  layers,
});

describe("share payload", () => {
  it("drops hidden layers, thumbnail and local id", () => {
    const d = drawing([drawLayer("hidden", false), drawLayer("kept", true)], "hidden");
    const out = stripForShare(d, "share-x");
    expect(out.layers).toHaveLength(1);
    expect(out.thumbnail).toBe("");
    expect(out.id).toBe("share-x");
    expect(out.activeLayerId).toBe("kept");
  });

  it("share file carries only kept image blobs", async () => {
    const d = drawing(
      [drawLayer("l1", true), imageLayer("l2", "blob_hidden", false), imageLayer("l3", "blob_kept", true)],
      "l1",
    );
    const file = await buildShareFile(d, async (id) => stored(id), "share-x");
    const ids = file.blobs.map((b) => b.id);
    expect(ids).toContain("blob_kept");
    expect(ids).not.toContain("blob_hidden");
    expect(ids.some((id) => id.startsWith("thumb_"))).toBe(false);
    expect(file.blobs.every((b) => !b.originalName)).toBe(true);
    expect(JSON.stringify(file).startsWith('{"format":"zketch"')).toBe(true);
  });

  it("share file round-trips through parseBackup with the kept layers", async () => {
    const d = drawing(
      [drawLayer("hidden", false), drawLayer("l1", true), imageLayer("l2", "blob_kept", true)],
      "l1",
    );
    const file = await buildShareFile(d, async (id) => stored(id), "share-x");
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.drawings).toHaveLength(1);
    expect(parsed.drawings[0].id).toBe("share-x");
    expect(parsed.drawings[0].layers.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(parsed.blobs.map((b) => b.id)).toEqual(["blob_kept"]);
    expect(parsed.blobs[0].size).toBe(png.length);
  });
});
