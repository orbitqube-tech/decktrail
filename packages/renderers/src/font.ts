import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Load the embedded webfont for a theme's family, if one has been fetched.
 *
 * A theme names a family; it never carried one. So `--font:Inter, -apple-system, ...` asked for
 * Inter and got whatever the reader's system had, which at weight 900 is a different typeface in
 * all but name, and which moves the measure as well: a `ch` is the width of a zero in the font
 * in use, so the same 76ch is 815px in Inter and 696px in Segoe UI.
 *
 * `scripts/fetch-fonts.mjs` fetches the family once, at deploy or first run, and caches it here
 * as @font-face rules with the woff2 inline. This reads that cache. The point of the round trip
 * is that the reader never makes one: a deck that linked Google would make a client's browser
 * announce every private document it opened to a third party.
 *
 * **This is the one module in the package that touches a disk, and the renderers do not call it.**
 * They take the CSS as an option. A renderer that read the cache itself would return different
 * HTML depending on whether a file happened to exist, which would make its tests agree with
 * whatever the machine had lying around: the exact shape of failure this repository already
 * shipped once, with in-memory fakes that diverged from the real store. Callers load it and pass
 * it in, so the render stays a function of its arguments.
 *
 * No cache means no rule, and the deck falls back to the system face exactly as it did before.
 * A missing font is not a reason to fail a render.
 */
const cache = new Map<string, string>();

/** A family name to the file it is cached under. Must match slug() in scripts/fetch-fonts.mjs. */
export function fontSlug(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * @font-face CSS for `family`, or "" when it has not been fetched. Read once per family and
 * held: a deck is rendered per viewer, and this is a hundred kilobytes off the disk.
 */
export function fontFaceCss(family: string): string {
  const key = fontSlug(family);
  if (!key) return "";
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let css = "";
  try {
    // assets/ sits beside dist/ in the built package, and beside src/ in the source tree.
    const path = fileURLToPath(new URL(`../assets/fonts/${key}.css`, import.meta.url));
    css = readFileSync(path, "utf8");
  } catch {
    // Not fetched, or not readable. Neither is an error: the deck renders in the system face.
    css = "";
  }
  cache.set(key, css);
  return css;
}

/** Drop a cached family, so a fetch during a long-lived process is picked up. Used by tests. */
export function clearFontCache(): void {
  cache.clear();
}
