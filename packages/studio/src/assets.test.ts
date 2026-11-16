import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAssets, ASSET_MANIFEST } from "./assets.js";

describe("loading images for generate --assets", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dt-assets-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("turns each image into a data URI with its alt text from the manifest", () => {
    writeFileSync(join(dir, "signin.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(dir, "map.jpg"), Buffer.from([0xff, 0xd8]));
    writeFileSync(join(dir, ASSET_MANIFEST), JSON.stringify({ "signin.png": "Sign in screen" }));
    const { assets, skipped, totalBytes } = loadAssets(dir);
    expect(assets.map((a) => a.name)).toEqual(["map.jpg", "signin.png"]);
    expect(assets[1]).toMatchObject({ alt: "Sign in screen", src: "data:image/png;base64,iVBORw==" });
    expect(assets[0].alt).toBeUndefined();
    expect(assets[0].src.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(skipped).toEqual([]);
    expect(totalBytes).toBe(6);
  });

  it("skips what a deck cannot carry, and reports it rather than dropping it silently", () => {
    writeFileSync(join(dir, "notes.txt"), "x");
    writeFileSync(join(dir, "a.webp"), "x");
    const { assets, skipped } = loadAssets(dir);
    expect(assets.map((a) => a.name)).toEqual(["a.webp"]);
    expect(skipped).toEqual(["notes.txt"]);
  });

  it("names the manifest when it is not valid JSON", () => {
    writeFileSync(join(dir, ASSET_MANIFEST), "{ not json");
    expect(() => loadAssets(dir)).toThrow(/assets\.json is not valid JSON/);
  });

  it("skips a folder named like an image", () => {
    mkdirSync(join(dir, "shots.png"));
    writeFileSync(join(dir, "real.png"), "x");
    const { assets, skipped } = loadAssets(dir);
    expect(assets.map((a) => a.name)).toEqual(["real.png"]);
    expect(skipped).toEqual(["shots.png"]);
  });

  it("refuses a path that is not a folder", () => {
    expect(() => loadAssets(join(dir, "missing"))).toThrow(/is not a folder/);
  });
});
