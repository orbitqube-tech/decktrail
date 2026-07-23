import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Voice } from "@decktrail/ir";
import { CONFIG_DIR_NAME } from "./config.js";
import { fetchVoice } from "./push.js";

export const VOICE_CACHE_FILE_NAME = "voice.cache.json";

/**
 * The cached copy lives under your home directory, not beside the content.
 *
 * A voice belongs to the operator and their portal, not to whichever folder a document happens
 * to sit in. Caching per directory would scatter copies that each drift separately, which is the
 * duplicated-configuration problem this project already paid for once.
 */
export function voiceCachePath(home: string = homedir()): string {
  return join(home, CONFIG_DIR_NAME, VOICE_CACHE_FILE_NAME);
}

export interface VoiceCache {
  /** The portal this was read from. A cache from another portal is another operator's voice. */
  source: string;
  /** When it was read, ISO 8601. */
  fetchedAt: string;
  voice: unknown;
}

/** Where a resolved voice came from, so the caller can say so out loud. */
export type VoiceOrigin =
  | { kind: "file"; path: string }
  | { kind: "portal"; url: string }
  | { kind: "cache"; url: string; fetchedAt: string; ageDays: number; stale: boolean }
  | { kind: "default" };

export interface ResolvedVoice {
  voice: Voice | undefined;
  origin: VoiceOrigin;
}

export function readVoiceCache(path: string = voiceCachePath()): VoiceCache | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as VoiceCache;
    if (!parsed || typeof parsed.source !== "string" || typeof parsed.fetchedAt !== "string") return null;
    return parsed;
  } catch {
    // An unreadable cache is treated as no cache. It is a convenience copy of something the
    // portal holds authoritatively, so there is nothing here to salvage and nothing to report
    // beyond falling through to the next source, which the caller announces anyway.
    return null;
  }
}

/**
 * Refresh the cache from a live read. This is the only writer.
 *
 * The cache is never hand-edited and never the primary source: the portal stays the one
 * authoritative home for the voice, exactly as it is for the console's Voice tab. This file is a
 * dated copy of that, and it carries the date precisely so it can be read as evidence with an
 * as-of stamp rather than as current truth.
 */
export function writeVoiceCache(source: string, voice: unknown, path: string = voiceCachePath()): VoiceCache {
  const entry: VoiceCache = { source, fetchedAt: new Date().toISOString(), voice };
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

export function cacheAgeDays(fetchedAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(fetchedAt).getTime()) / 86_400_000));
}

function foldMarkdown(base: Voice, markdown: string | undefined): Voice {
  if (!markdown) return base;
  const md = markdown.trim();
  base.instructions = base.instructions ? `${base.instructions}\n\n${md}` : md;
  return base;
}

export interface ResolveVoiceInput {
  /** An explicit --voice file. */
  jsonPath?: string;
  /** An explicit --voice-md file, folded into whichever voice wins. */
  markdownPath?: string;
  portalUrl?: string;
  portalToken?: string;
  cacheMaxAgeDays: number;
  /** Everything the resolution says about itself goes here, never to stdout. */
  warn: (message: string) => void;
  /** Injectable so the resolution order can be tested without a portal or a network. */
  fetchVoiceImpl?: typeof fetchVoice;
  cachePath?: string;
  now?: number;
}

/**
 * Resolve the voice to generate with, most specific source first.
 *
 *   1. An explicit `--voice` file.
 *   2. `voice.json` beside the content, for someone working entirely from the command line.
 *   3. The voice set in the console, read live from the portal. This is where it actually lives.
 *   4. The dated local cache of (3), used only when the portal cannot be reached.
 *   5. The neutral default.
 *
 * Two behaviours here are deliberate and were both bugs before.
 *
 * The portal is consulted at all because the console's Voice tab used to write to a row nothing
 * ever read: editing your tone and pressing Save changed nothing, while generation quietly used
 * a file on whatever machine ran the command. Two sources of truth, one of them decorative.
 *
 * An unreachable portal now falls through instead of failing the run. It used to throw straight
 * out, so losing your connection did not degrade generation, it stopped it: the author had
 * already chosen their content and their client and got an HTTP error for it. Generating a deck
 * is not a money path. The right failure here is a worse voice with a loud warning, not no deck.
 */
export async function resolveVoice(input: ResolveVoiceInput): Promise<ResolvedVoice> {
  const markdown = input.markdownPath ? readFileSync(input.markdownPath, "utf8") : undefined;

  if (input.jsonPath) {
    const base = Voice.parse(JSON.parse(readFileSync(input.jsonPath, "utf8")));
    return { voice: foldMarkdown(base, markdown), origin: { kind: "file", path: input.jsonPath } };
  }

  if (input.portalUrl && input.portalToken) {
    const fetchImpl = input.fetchVoiceImpl ?? fetchVoice;
    try {
      const remote = await fetchImpl(input.portalUrl, input.portalToken);
      if (remote) {
        writeVoiceCache(input.portalUrl, remote, input.cachePath ?? voiceCachePath());
        return {
          voice: foldMarkdown(Voice.parse(remote), markdown),
          origin: { kind: "portal", url: input.portalUrl },
        };
      }
      input.warn(`the portal at ${input.portalUrl} has no voice set; falling back`);
    } catch (e) {
      input.warn(`could not reach the portal at ${input.portalUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const cached = readVoiceCache(input.cachePath ?? voiceCachePath());
    if (cached) {
      // A cache minted against a different portal is a different operator's register. Using it
      // would be inventing a value rather than reading one, so it is refused by name.
      if (cached.source !== input.portalUrl) {
        input.warn(`the cached voice was read from ${cached.source}, not ${input.portalUrl}; ignoring it`);
      } else {
        const ageDays = cacheAgeDays(cached.fetchedAt, input.now);
        const stale = ageDays > input.cacheMaxAgeDays;
        input.warn(
          `using the voice cached from ${cached.source}, fetched ${cached.fetchedAt} (${ageDays} day(s) old)` +
            (stale ? `, which is past the ${input.cacheMaxAgeDays} day freshness budget` : ""),
        );
        return {
          voice: foldMarkdown(Voice.parse(cached.voice), markdown),
          origin: { kind: "cache", url: cached.source, fetchedAt: cached.fetchedAt, ageDays, stale },
        };
      }
    }
  }

  if (markdown) {
    return { voice: foldMarkdown(Voice.parse({ name: "custom" }), markdown), origin: { kind: "file", path: input.markdownPath ?? "" } };
  }

  return { voice: undefined, origin: { kind: "default" } };
}

/** One line naming exactly which of the five sources supplied the voice. */
export function describeVoiceOrigin(origin: VoiceOrigin): string {
  switch (origin.kind) {
    case "file":
      return `voice from ${origin.path}`;
    case "portal":
      return `voice from the console at ${origin.url}`;
    case "cache":
      return `voice from the local cache of ${origin.url}, fetched ${origin.fetchedAt}, ${origin.ageDays} day(s) old${origin.stale ? " and stale" : ""}`;
    case "default":
      return "no voice configured, using the neutral default";
  }
}
