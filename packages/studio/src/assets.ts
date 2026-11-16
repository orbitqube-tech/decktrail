import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { GenerateAsset } from "@decktrail/generate";

/** The image types a deck can carry inline. Anything else in the folder is skipped, and said so. */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** The optional file in an assets folder that says what each image shows: `{ "<file>": "<alt>" }`. */
export const ASSET_MANIFEST = "assets.json";

/**
 * Above this, a deck is heavy enough that every reader downloads it on every open. Not refused,
 * because a screenshot walkthrough is legitimately large, but said out loud.
 */
export const ASSET_WARN_BYTES = 8 * 1024 * 1024;

export interface LoadedAssets {
  assets: GenerateAsset[];
  skipped: string[];
  totalBytes: number;
}

/**
 * Read a folder of images for `generate --assets`. Each image becomes a data: URI, so the deck
 * stays one self-contained file and a reader's browser fetches nothing to open it. The alt text
 * comes from assets.json when present, because what a screenshot shows is what lets the model put
 * it next to the right words; without it the model has only a file name to go on.
 */
export function loadAssets(dir: string): LoadedAssets {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`--assets ${dir} is not a folder`);
  const manifestPath = join(dir, ASSET_MANIFEST);
  const alts: Record<string, unknown> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const assets: GenerateAsset[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;
  for (const file of readdirSync(dir).sort()) {
    if (file === ASSET_MANIFEST) continue;
    const mime = MIME[extname(file).toLowerCase()];
    if (!mime) {
      skipped.push(file);
      continue;
    }
    const bytes = readFileSync(join(dir, file));
    totalBytes += bytes.length;
    const alt = typeof alts[file] === "string" ? (alts[file] as string) : undefined;
    assets.push({ name: file, alt, src: `data:${mime};base64,${bytes.toString("base64")}` });
  }
  return { assets, skipped, totalBytes };
}
