// Tell OpenCode about a local routing gateway, without damaging configuration that is not ours.
//
// OpenCode's config file belongs to the author and may already say things that must survive. So
// this merges rather than writes, keeps a backup, does nothing when the provider is already there,
// and refuses rather than guesses when the file carries comments a JSON parser would silently
// destroy. In that last case it prints the snippet and lets a person paste it.
//
// Called by scripts/up.sh and scripts/up.ps1 so both platforms wire it identically. Reads the port
// from GATEWAY_PORT.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const port = process.env["GATEWAY_PORT"];
if (!port) {
  console.log("  GATEWAY_PORT is not set, so OpenCode was left alone");
  process.exit(0);
}

const dir = join(homedir(), ".config", "opencode");
const asJson = join(dir, "opencode.json");
const asJsonc = join(dir, "opencode.jsonc");
const target = existsSync(asJson) ? asJson : existsSync(asJsonc) ? asJsonc : asJson;

/**
 * `npm` is required: OpenCode has no built-in knowledge of a gateway, so it has to be told which
 * client to speak. The model is aliased because a model reference has exactly two parts, and a
 * gateway model id containing a slash would make three and fail to resolve.
 */
const entry = {
  npm: "@ai-sdk/openai-compatible",
  name: "DeckTrail routing gateway",
  options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "noauth" },
  models: { bestfast: { id: "auto/best-fast" } },
};

const snippet = `  "provider": { "omniroute": ${JSON.stringify(entry)} }`;
const raw = existsSync(target) ? readFileSync(target, "utf8") : "";

if (/^\s*\/\//m.test(raw) || raw.includes("/*")) {
  console.log(`  Your ${target} has comments, so it was left untouched. Add this to it:`);
  console.log(snippet);
  process.exit(0);
}

let config = {};
if (raw.trim()) {
  try {
    config = JSON.parse(raw);
  } catch {
    console.log(`  Could not read ${target} as JSON, so it was left untouched. Add this to it:`);
    console.log(snippet);
    process.exit(0);
  }
}

config.provider = config.provider ?? {};
if (config.provider.omniroute) {
  console.log("  OpenCode already knows about the gateway");
  process.exit(0);
}

config.provider.omniroute = entry;
mkdirSync(dir, { recursive: true });
if (raw) copyFileSync(target, `${target}.bak`);
writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
console.log(`  Told OpenCode about the gateway in ${target}${raw ? " (previous version kept as .bak)" : ""}`);
