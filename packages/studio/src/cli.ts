#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Voice, Theme } from "@decktrail/ir";
import { runValidate, runRender } from "./commands.js";
import { generateDeck } from "./generate.js";
import { publishAndShare, fetchVoice } from "./push.js";
import { fetchBrand } from "./brand.js";

/**
 * Load the author's Voice for generation, or undefined for the neutral default.
 *
 * Order, most specific first:
 *   1. --voice <file>, an explicit file the caller named.
 *   2. voice.json beside the content, for someone working entirely from the command line.
 *   3. The voice set in the console, read from the portal. This is the one an operator means
 *      when they edit the Voice tab and press Save.
 * A --voice-md (else voice.md) is folded into whichever wins.
 *
 * The portal is last rather than first so an explicit local file still wins, but it is here at
 * all because before this it was nowhere: the console wrote the voice to a row that nothing
 * read, and generation silently used a file on disk instead.
 */
async function loadVoice(rest: string[]): Promise<Voice | undefined> {
  const jsonPath = flag(rest, "--voice") ?? (existsSync("voice.json") ? "voice.json" : undefined);
  const mdPath = flag(rest, "--voice-md") ?? (existsSync("voice.md") ? "voice.md" : undefined);

  if (!jsonPath) {
    const portal = flag(rest, "--portal");
    const token = flag(rest, "--token");
    if (portal && token) {
      const remote = await fetchVoice(portal, token);
      if (remote) {
        const base = Voice.parse(remote);
        if (mdPath) {
          const md = readFileSync(mdPath, "utf8").trim();
          base.instructions = base.instructions ? `${base.instructions}

${md}` : md;
        }
        process.stderr.write(`using the voice set in the console at ${portal}
`);
        return base;
      }
    }
  }

  if (!jsonPath && !mdPath) return undefined;

  const base = jsonPath ? Voice.parse(JSON.parse(readFileSync(jsonPath, "utf8"))) : Voice.parse({ name: "custom" });
  if (mdPath) {
    const md = readFileSync(mdPath, "utf8").trim();
    base.instructions = base.instructions ? `${base.instructions}\n\n${md}` : md;
  }
  return base;
}

function usage(): never {
  process.stdout.write(`decktrail <command>

  validate <file>                    Validate a DeckTrail IR JSON file.
  render <file> [--out <file>] [--theme <file.json>] [--public | --confidential <text>]
                                     Render an IR file to standalone HTML. Marked
                                     "Private & Confidential" unless --public drops the
                                     label or --confidential replaces its text. The brand
                                     comes from --theme, else theme.json here, else a
                                     neutral default.
  generate <content> [--out <file>] [--client <name>] [--voice <file.json>] [--voice-md <file.md>]
                     [--portal <url> --token <token>]
                                     Generate a deck IR from a content file using your
                                     Claude Code login (subscription-only), then validate it.
                                     --client sets who the deck is for, which groups your
                                     decks in the console; inferred from the content if
                                     omitted. The voice comes from --voice, else voice.json
                                     here, else the voice you set in the console (give
                                     --portal and --token to read it), else a neutral
                                     default.
  push <file> --portal <url> --token <token> [--recipient <email>] [--theme <file>]
                                     Publish an IR file to a portal, and optionally share it.
  brand <url> [--out <file>]         Extract a theme from a website into theme.json.
`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (!cmd) usage();

  if (cmd === "validate") {
    if (!file) usage();
    const res = runValidate(JSON.parse(readFileSync(file, "utf8")));
    if (res.ok) {
      process.stdout.write(`valid: ${res.kind}\n`);
      return;
    }
    process.stderr.write(`invalid: ${res.error}\n`);
    process.exit(1);
  }

  if (cmd === "render") {
    if (!file) usage();
    // --public drops the confidentiality label, for a deck meant to be seen by anyone.
    // --confidential "Text" replaces it. Neither flag means the default label stands.
    const custom = flag(rest, "--confidential");
    const opts =
      rest.includes("--public") ? { confidentialLabel: null } : custom ? { confidentialLabel: custom } : {};
    // A local render had no way to apply a brand: it always used the neutral theme, so a deck
    // rendered here came out unbranded however carefully the theme had been set up. The portal
    // applies a per-artifact theme when it serves (D16); this is the same thing on your machine.
    const themePath = flag(rest, "--theme") ?? (existsSync("theme.json") ? "theme.json" : undefined);
    const theme = themePath ? Theme.parse(JSON.parse(readFileSync(themePath, "utf8"))) : undefined;
    const html = runRender(JSON.parse(readFileSync(file, "utf8")), theme, opts);
    const out = flag(rest, "--out");
    if (out) {
      writeFileSync(out, html);
      process.stdout.write(`wrote ${out}\n`);
    } else {
      process.stdout.write(html);
    }
    return;
  }

  if (cmd === "generate") {
    if (!file) usage();
    const deck = await generateDeck(readFileSync(file, "utf8"), await loadVoice(rest), flag(rest, "--client"), {
      // Repair is another slow model call, so say it is happening rather than appear to hang.
      onRetry: (attempt) =>
        process.stderr.write(`the generated deck did not validate, asking for a repair (attempt ${attempt})\n`),
    });
    const out = flag(rest, "--out") ?? "deck.json";
    writeFileSync(out, JSON.stringify(deck, null, 2));
    process.stdout.write(`wrote ${out}\n`);
    return;
  }

  if (cmd === "push") {
    if (!file) usage();
    const portal = flag(rest, "--portal");
    const token = flag(rest, "--token");
    if (!portal || !token) {
      process.stderr.write("push requires --portal <url> and --token <token>\n");
      process.exit(1);
    }
    const ir = JSON.parse(readFileSync(file, "utf8"));
    const themeFile = flag(rest, "--theme");
    const theme = themeFile ? JSON.parse(readFileSync(themeFile, "utf8")) : undefined;
    const recipient = flag(rest, "--recipient");
    const { published, share } = await publishAndShare(portal, token, ir, { theme, recipient });
    process.stdout.write(`published: artifact ${published.artifactId}, version ${published.version}\n`);
    if (share) process.stdout.write(`share: ${share.url}\n`);
    return;
  }

  if (cmd === "brand") {
    if (!file) usage();
    const theme = await fetchBrand(file);
    const out = flag(rest, "--out") ?? "theme.json";
    writeFileSync(out, JSON.stringify(theme, null, 2));
    process.stdout.write(`wrote ${out}\n`);
    return;
  }

  usage();
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
