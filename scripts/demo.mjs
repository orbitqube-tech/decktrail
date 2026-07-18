#!/usr/bin/env node
/**
 * Render the example deck and say where it went.
 *
 * The shortest path from cloning this to seeing what it makes. It also exercises the whole
 * renderer, so if it fails, something real is broken.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "packages", "studio", "dist", "cli.js");
const deck = join(root, "examples", "decktrail.deck.json");
const out = join(root, "examples", "decktrail.deck.html");

if (!existsSync(cli)) {
  process.stderr.write("Build first: pnpm install && pnpm -r build\n");
  process.exit(1);
}

// --public: this one is meant to be read by anyone, so it carries no confidentiality label.
execFileSync(process.execPath, [cli, "render", deck, "--public", "--out", out], { stdio: "inherit" });
process.stdout.write(`\nOpen it: ${out}\n`);
if (!existsSync(join(root, "packages", "renderers", "assets", "fonts", "inter.css"))) {
  process.stdout.write("Fonts are not fetched, so this renders in your system font. `pnpm fetch-fonts` fixes that.\n");
}
