#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Theme } from "@decktrail/ir";
import { generateDeck, createProvider, PROVIDER_IDS } from "@decktrail/generate";
import { runValidate, runRender } from "./commands.js";
import { publishAndShare, fetchVoice } from "./push.js";
import { fetchBrand } from "./brand.js";
import { loadConfig, describeConfig, type ConfigFlags, type StudioConfig } from "./config.js";
import { resolveVoice, describeVoiceOrigin, writeVoiceCache, voiceCachePath } from "./voice.js";

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
                     [--provider <${PROVIDER_IDS.join("|")}>] [--model <provider/model>] [--command <bin>]
                     [--portal <url>] [--token <token>]
                                     Generate a deck IR from a content file, then validate it.
                                     --provider picks the model backend: "claude" (the default)
                                     runs your own Claude Code login and needs no key; "opencode"
                                     runs the OpenCode CLI, which is how you reach a local or a
                                     free model. --client sets who the deck is for, which groups
                                     your decks in the console; inferred from the content if
                                     omitted. The voice comes from --voice, else voice.json here,
                                     else the voice you set in the console, else its local cache
                                     when the portal is unreachable, else a neutral default.
  push <file> [--portal <url>] [--token <token>] [--recipient <email>] [--theme <file>]
                                     Publish an IR file to a portal, and optionally share it.
  brand <url> [--out <file>]         Extract a theme from a website into theme.json.
  voice pull [--portal <url>] [--token <token>]
                                     Read the voice from the portal and cache it locally, so
                                     generation keeps its register when you are offline.
  voice show                         Print the voice that generation would use, and where it
                                     came from.
  config show                        Print every resolved setting and which layer set it. The
                                     admin token is reported as set or not set, never printed.

  Settings resolve flag, then environment, then .decktrail/config.json here, then the same
  file under your home directory, then the built-in default. See "config show".
`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function configFlags(rest: string[]): ConfigFlags {
  return {
    portal: flag(rest, "--portal"),
    token: flag(rest, "--token"),
    provider: flag(rest, "--provider"),
    model: flag(rest, "--model"),
    command: flag(rest, "--command"),
    timeoutMs: flag(rest, "--timeout-ms"),
    repairAttempts: flag(rest, "--repair-attempts"),
  };
}

const warn = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

/** Fail naming the setting and every way to supply it, rather than the bare word "required". */
function requirePortal(config: StudioConfig): { url: string; token: string } {
  const url = config.portal.url.value;
  const token = config.portal.token.value;
  if (!url || !token) {
    const missing = [!url ? "the portal URL" : "", !token ? "the admin token" : ""].filter(Boolean).join(" and ");
    process.stderr.write(
      `${missing} is not set. Supply it with --portal / --token, or DT_PORTAL_URL / DT_PORTAL_TOKEN, ` +
        `or a .decktrail/config.json. Run "decktrail config show" to see what resolved.\n`,
    );
    process.exit(1);
  }
  return { url, token };
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

  if (cmd === "config") {
    if (file !== "show") usage();
    process.stdout.write(`${describeConfig(loadConfig(configFlags(rest)))}\n`);
    return;
  }

  if (cmd === "voice") {
    const config = loadConfig(configFlags(rest));

    if (file === "pull") {
      const { url, token } = requirePortal(config);
      const remote = await fetchVoice(url, token);
      if (!remote) {
        process.stderr.write(`the portal at ${url} has no voice set, so there is nothing to cache\n`);
        process.exit(1);
      }
      const entry = writeVoiceCache(url, remote);
      process.stdout.write(`cached the voice from ${url} at ${voiceCachePath()} (${entry.fetchedAt})\n`);
      return;
    }

    if (file === "show") {
      const resolved = await resolveVoice({
        jsonPath: flag(rest, "--voice") ?? (existsSync("voice.json") ? "voice.json" : undefined),
        markdownPath: flag(rest, "--voice-md") ?? (existsSync("voice.md") ? "voice.md" : undefined),
        portalUrl: config.portal.url.value,
        portalToken: config.portal.token.value,
        cacheMaxAgeDays: config.voice.cacheMaxAgeDays.value,
        warn,
      });
      process.stdout.write(`${describeVoiceOrigin(resolved.origin)}\n`);
      if (resolved.voice) process.stdout.write(`${JSON.stringify(resolved.voice, null, 2)}\n`);
      return;
    }

    usage();
  }

  if (cmd === "generate") {
    if (!file) usage();
    const config = loadConfig(configFlags(rest));

    const resolved = await resolveVoice({
      jsonPath: flag(rest, "--voice") ?? (existsSync("voice.json") ? "voice.json" : undefined),
      markdownPath: flag(rest, "--voice-md") ?? (existsSync("voice.md") ? "voice.md" : undefined),
      portalUrl: config.portal.url.value,
      portalToken: config.portal.token.value,
      cacheMaxAgeDays: config.voice.cacheMaxAgeDays.value,
      warn,
    });
    warn(describeVoiceOrigin(resolved.origin));

    const provider = createProvider({
      id: config.generate.provider.value,
      command: config.generate.command.value,
      model: config.generate.model.value,
      timeoutMs: config.generate.timeoutMs.value,
    });
    // Which model wrote the deck is not a detail: two backends produce visibly different decks
    // from the same content, and an author who cannot see which one ran cannot account for the
    // difference.
    warn(`generating with ${provider.describe()}`);

    const deck = await generateDeck(readFileSync(file, "utf8"), resolved.voice, flag(rest, "--client"), {
      provider,
      repairAttempts: config.generate.repairAttempts.value,
      // Repair is another slow model call, so say it is happening rather than appear to hang.
      onRetry: (attempt) =>
        warn(`the generated deck did not validate, asking for a repair (attempt ${attempt})`),
    });
    const out = flag(rest, "--out") ?? "deck.json";
    writeFileSync(out, JSON.stringify(deck, null, 2));
    process.stdout.write(`wrote ${out}\n`);
    return;
  }

  if (cmd === "push") {
    if (!file) usage();
    const config = loadConfig(configFlags(rest));
    const { url, token } = requirePortal(config);
    const ir = JSON.parse(readFileSync(file, "utf8"));
    const themeFile = flag(rest, "--theme");
    const theme = themeFile ? JSON.parse(readFileSync(themeFile, "utf8")) : undefined;
    const recipient = flag(rest, "--recipient");
    const { published, share } = await publishAndShare(url, token, ir, { theme, recipient });
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
