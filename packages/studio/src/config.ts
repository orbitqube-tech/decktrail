import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PROVIDER_ID, DEFAULT_REPAIR_ATTEMPTS, DEFAULT_GENERATE_TIMEOUT_MS } from "@decktrail/generate";

/**
 * Where settings live, and which one wins.
 *
 * One setting, one authoritative home, and a visible answer to "which copy am I actually
 * running". Layered configuration is where a stale duplicate at a higher-priority layer silently
 * overrides the fresh one you just edited, so every resolved value carries the layer it came
 * from and `decktrail config show` prints both. Reading the file is not the same as knowing the
 * value.
 *
 * Highest priority first:
 *   1. A command line flag, for this one invocation.
 *   2. An environment variable, for this shell or this container.
 *   3. `.decktrail/config.json` in the working directory, for this project.
 *   4. `.decktrail/config.json` under your home directory, for this machine.
 *   5. The built-in default.
 */
export const CONFIG_DIR_NAME = ".decktrail";
export const CONFIG_FILE_NAME = "config.json";

export type ConfigLayer = "flag" | "environment" | "project file" | "home file" | "default";

export interface Resolved<T> {
  value: T;
  layer: ConfigLayer;
}

export interface StudioConfig {
  portal: {
    url: Resolved<string | undefined>;
    /** Secret. Never printed, never logged, never included in an error message. */
    token: Resolved<string | undefined>;
  };
  generate: {
    provider: Resolved<string>;
    model: Resolved<string | undefined>;
    command: Resolved<string | undefined>;
    timeoutMs: Resolved<number>;
    repairAttempts: Resolved<number>;
  };
  voice: {
    cacheMaxAgeDays: Resolved<number>;
  };
}

/**
 * How old a cached voice may get before the warning sharpens.
 *
 * Thirty days, because a voice is a register and a house style: it is edited when positioning
 * changes, not weekly. Past this the run still proceeds. Generating a deck is not a money path,
 * so a stale voice degrades the writing rather than doing damage, and blocking the author out of
 * their own offline generation would cost more than it protects.
 */
export const DEFAULT_VOICE_CACHE_MAX_AGE_DAYS = 30;

interface FileShape {
  portal?: { url?: unknown; token?: unknown };
  generate?: { provider?: unknown; model?: unknown; command?: unknown; timeoutMs?: unknown; repairAttempts?: unknown };
  voice?: { cacheMaxAgeDays?: unknown };
}

function readConfigFile(dir: string): FileShape | null {
  const path = join(dir, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as FileShape;
  } catch (e) {
    // A malformed settings file is refused rather than ignored. Silently falling back to the
    // defaults would run the job against a different portal or a different model than the file
    // says, and report success.
    throw new Error(`${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function pickString(
  flag: string | undefined,
  env: string | undefined,
  project: unknown,
  home: unknown,
  fallback: string | undefined,
): Resolved<string | undefined> {
  if (flag !== undefined) return { value: flag, layer: "flag" };
  if (env !== undefined && env !== "") return { value: env, layer: "environment" };
  if (typeof project === "string" && project !== "") return { value: project, layer: "project file" };
  if (typeof home === "string" && home !== "") return { value: home, layer: "home file" };
  return { value: fallback, layer: "default" };
}

function pickNumber(
  flag: string | undefined,
  env: string | undefined,
  project: unknown,
  home: unknown,
  fallback: number,
  name: string,
): Resolved<number> {
  const parse = (raw: string, layer: ConfigLayer): Resolved<number> => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
    return { value: n, layer };
  };
  if (flag !== undefined) return parse(flag, "flag");
  if (env !== undefined && env !== "") return parse(env, "environment");
  if (typeof project === "number") return { value: project, layer: "project file" };
  if (typeof home === "number") return { value: home, layer: "home file" };
  return { value: fallback, layer: "default" };
}

export interface ConfigFlags {
  portal?: string;
  token?: string;
  provider?: string;
  model?: string;
  command?: string;
  timeoutMs?: string;
  repairAttempts?: string;
}

/** Resolve every setting from flags, environment, and the two config files. */
export function loadConfig(
  flags: ConfigFlags = {},
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): StudioConfig {
  const project = readConfigFile(cwd) ?? {};
  const home = readConfigFile(homedir()) ?? {};

  // The binary override is per provider, since "which command" only makes sense once you know
  // which backend you are pointing at.
  const providerId = pickString(
    flags.provider,
    env.DT_GENERATE_PROVIDER,
    project.generate?.provider,
    home.generate?.provider,
    DEFAULT_PROVIDER_ID,
  ) as Resolved<string>;
  const commandEnvVar = providerId.value === "opencode" ? env.DT_OPENCODE_COMMAND : env.DT_CLAUDE_COMMAND;

  return {
    portal: {
      url: pickString(flags.portal, env.DT_PORTAL_URL, project.portal?.url, home.portal?.url, undefined),
      token: pickString(flags.token, env.DT_PORTAL_TOKEN, project.portal?.token, home.portal?.token, undefined),
    },
    generate: {
      provider: providerId,
      model: pickString(flags.model, env.DT_GENERATE_MODEL, project.generate?.model, home.generate?.model, undefined),
      command: pickString(flags.command, commandEnvVar, project.generate?.command, home.generate?.command, undefined),
      timeoutMs: pickNumber(
        flags.timeoutMs,
        env.DT_GENERATE_TIMEOUT_MS,
        project.generate?.timeoutMs,
        home.generate?.timeoutMs,
        DEFAULT_GENERATE_TIMEOUT_MS,
        "DT_GENERATE_TIMEOUT_MS",
      ),
      repairAttempts: pickNumber(
        flags.repairAttempts,
        env.DT_GENERATE_REPAIR_ATTEMPTS,
        project.generate?.repairAttempts,
        home.generate?.repairAttempts,
        DEFAULT_REPAIR_ATTEMPTS,
        "DT_GENERATE_REPAIR_ATTEMPTS",
      ),
    },
    voice: {
      cacheMaxAgeDays: pickNumber(
        undefined,
        env.DT_VOICE_CACHE_MAX_AGE_DAYS,
        project.voice?.cacheMaxAgeDays,
        home.voice?.cacheMaxAgeDays,
        DEFAULT_VOICE_CACHE_MAX_AGE_DAYS,
        "DT_VOICE_CACHE_MAX_AGE_DAYS",
      ),
    },
  };
}

/**
 * Render the resolved configuration for `decktrail config show`.
 *
 * The token is reported as set or not set and never as a value. It is a credential, and a
 * credential that has been printed once is a credential that lives in a scrollback buffer, a
 * terminal log and a screenshot from then on.
 */
export function describeConfig(config: StudioConfig): string {
  const line = (name: string, r: Resolved<unknown>): string =>
    `  ${name.padEnd(22)} ${String(r.value ?? "(not set)").padEnd(28)} from ${r.layer}`;
  return [
    "portal",
    line("url", config.portal.url),
    `  ${"token".padEnd(22)} ${(config.portal.token.value ? "(set)" : "(not set)").padEnd(28)} from ${config.portal.token.layer}`,
    "generate",
    line("provider", config.generate.provider),
    line("model", config.generate.model),
    line("command", config.generate.command),
    line("timeoutMs", config.generate.timeoutMs),
    line("repairAttempts", config.generate.repairAttempts),
    "voice",
    line("cacheMaxAgeDays", config.voice.cacheMaxAgeDays),
  ].join("\n");
}
