#!/usr/bin/env node
/**
 * Fetch a webfont from Google once, here, so that a deck never fetches one from anyone.
 *
 * The theme names a font family. Nothing used to load it, so every deck rendered in whatever the
 * reader's system happened to have: at weight 900 that is visibly heavier than Inter Black, and
 * it moves the measure too, because a `ch` is the width of a zero in the font actually in use
 * (76ch is 815px in Inter and 696px in Segoe UI).
 *
 * The two obvious fixes are both bad. Linking Google from the deck makes a private document
 * fetch from a third party the moment a client opens it, and puts that open in Google's logs.
 * Committing the font blob puts a binary in the repository.
 *
 * So: fetch at deploy or first run, cache locally, and embed from the local copy at render time.
 * The network is touched once, on your machine or your server, and never by a reader.
 *
 *   node scripts/fetch-fonts.mjs                     # Inter, latin + latin-ext
 *   node scripts/fetch-fonts.mjs "Source Sans 3"     # some other family
 *   node scripts/fetch-fonts.mjs Inter --subsets latin
 *
 * Failure is not fatal. A deck without the cache still renders, in the system face, exactly as
 * it did before. This is an improvement, not a dependency.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "packages", "renderers", "assets", "fonts");

// Google serves woff2 only to a browser-shaped request. Asking as Node gets the ttf fallback,
// which is several times the size.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** A family name to the file we cache it under. Matches fontFaceCss() in the renderer. */
export const slug = (family) =>
  family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const args = process.argv.slice(2);
const family = args.find((a) => !a.startsWith("--")) ?? "Inter";
const subsetArg = args.indexOf("--subsets");
// latin alone is 63 KB and covers English. latin-ext adds 111 KB and covers the accented names
// a European client is likely to have, and a name is the one word on a proposal that must not
// fall back mid-word.
const subsets = (subsetArg >= 0 ? args[subsetArg + 1] : "latin,latin-ext").split(",").map((s) => s.trim());

const url =
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400..900&display=swap`;

const res = await fetch(url, { headers: { "User-Agent": UA } });
if (!res.ok) {
  process.stderr.write(`could not reach Google Fonts for "${family}" (${res.status}). Decks will use the system face.\n`);
  process.exit(1);
}
const css = await res.text();

// Each @font-face is preceded by a /* subset */ comment naming its unicode range.
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)];
if (blocks.length === 0) {
  process.stderr.write(`Google returned no @font-face for "${family}". Is the family name right?\n`);
  process.exit(1);
}

const out = [];
let total = 0;
for (const [, name, body] of blocks) {
  if (!subsets.includes(name)) continue;
  const src = body.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) continue;
  const weight = body.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? "400 900";
  const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
  const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
  total += buf.length;
  out.push(
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2');` +
      (range ? `unicode-range:${range};` : "") +
      `}`,
  );
  process.stderr.write(`  ${name}: ${(buf.length / 1024).toFixed(1)} KB\n`);
}

if (out.length === 0) {
  process.stderr.write(`none of the requested subsets (${subsets.join(", ")}) are served for "${family}".\n`);
  process.exit(1);
}

// The licence travels with the font. Google serves Inter and most of its catalogue under the SIL
// Open Font License, which permits embedding in a document and asks that the notice come along.
const header =
  `/* ${family}, fetched from Google Fonts by scripts/fetch-fonts.mjs. Generated, do not edit.\n` +
  `   Embedded so that a rendered deck fetches nothing from anyone when a client opens it.\n` +
  `   Licensed by its authors, for most of the Google Fonts catalogue under the SIL Open Font\n` +
  `   License 1.1: https://openfontlicense.org. The notice travels with the font. */\n`;

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `${slug(family)}.css`);
writeFileSync(file, header + out.join("\n") + "\n");

process.stderr.write(
  `\nwrote ${file}\n${family}: ${out.length} subset(s), ${(total / 1024).toFixed(1)} KB of font, ` +
    `about ${Math.round((total * 1.34) / 1024)} KB added to each rendered deck.\n`,
);
