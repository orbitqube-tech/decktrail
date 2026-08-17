import type { Theme } from "@decktrail/ir";
import { neutralTheme } from "./commands.js";

/**
 * Themes that ship with DeckTrail, selectable by name.
 *
 * A theme here is colour and type, and nothing else. It is not a layout: every theme renders
 * through the same shell, so choosing one restyles a deck without moving anything on it. That
 * is the whole reason a theme can be swapped after a deck is written.
 *
 * The neutral theme is the default and is not part of this table. Nothing below changes what
 * an author gets when they name no theme at all.
 */

/**
 * Cool, high-contrast, close to ink on paper. Navy against a muted red, on near-white.
 */
const crest: Theme = {
  name: "Crest",
  colors: {
    bg: "#F5F6F8",
    surfaceLow: "#FFFFFF",
    surfaceHigh: "#FFFFFF",
    accent: "#1A2541",
    accentDim: "#2E5E8C",
    accent2: "#8C2332",
    accent2Dim: "#68242F",
    text: "#3D4249",
    heading: "#14181F",
    muted: "#6B7280",
    good: "#2E7D5B",
    warn: "#A9761A",
    bad: "#A93B33",
  },
  typography: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    scale: 1.28,
  },
  logo: { src: "" },
};

/**
 * Warm and saturated, on cream rather than white. Blue and teal against pink and orange.
 */
const vivid: Theme = {
  name: "Vivid",
  colors: {
    bg: "#FFFCF5",
    surfaceLow: "#FFFFFF",
    surfaceHigh: "#FFFFFF",
    accent: "#207AB4",
    accentDim: "#57BDB9",
    accent2: "#E96493",
    accent2Dim: "#FF8F00",
    text: "#464646",
    heading: "#1F2A37",
    muted: "#7A7A7A",
    good: "#2E7D5B",
    warn: "#A9761A",
    bad: "#A93B33",
  },
  typography: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    scale: 1.28,
  },
  logo: { src: "" },
};

/**
 * Warm and playful, on cream. Teal against gold.
 *
 * Shares a ground and an ink with `vivid`, because both were drawn from the same warm family,
 * and then goes somewhere else with them: this one leads teal into gold, where vivid leads blue
 * into pink. The gold is the tell. It exists in the source palette and vivid uses it nowhere,
 * which is what makes these two distinct rather than one theme under two names.
 */
const storybook: Theme = {
  name: "Storybook",
  colors: {
    bg: "#FFFCF5",
    surfaceLow: "#FFFFFF",
    surfaceHigh: "#FFFFFF",
    accent: "#57BDB9",
    accentDim: "#207AB4",
    accent2: "#FBBB1B",
    accent2Dim: "#FF8F00",
    text: "#464646",
    heading: "#1F2A37",
    muted: "#7A7A7A",
    good: "#2E7D5B",
    warn: "#A9761A",
    bad: "#A93B33",
  },
  typography: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    scale: 1.28,
  },
  logo: { src: "" },
};

/**
 * Serif, on warm paper. Navy against rust.
 *
 * The dim tones repeat their base colour rather than introducing a shade nobody chose. This
 * palette was built with one tone per role, so a gradient here runs flat between two colours
 * instead of through a fourth and a fifth that would have to be invented to fill it.
 */
const editorial: Theme = {
  name: "Editorial",
  colors: {
    bg: "#FBFAF7",
    surfaceLow: "#FFFFFF",
    surfaceHigh: "#FFFFFF",
    accent: "#1A3A5C",
    accentDim: "#1A3A5C",
    accent2: "#B4531F",
    accent2Dim: "#B4531F",
    text: "#16171A",
    heading: "#16171A",
    muted: "#5A5B60",
    good: "#2E7D5B",
    warn: "#A9761A",
    bad: "#A93B33",
  },
  typography: {
    family: "Georgia, 'Times New Roman', serif",
    scale: 1.28,
  },
  logo: { src: "" },
};

/** Every named theme, keyed by the name an author types. */
export const themes: Readonly<Record<string, Theme>> = Object.freeze({
  crest,
  editorial,
  storybook,
  vivid,
});

/** The names an author may pass, in a stable order, for help text and error messages. */
export const themeNames: readonly string[] = Object.freeze(Object.keys(themes).sort());

/**
 * Resolve a `--theme` argument that names a built-in rather than pointing at a file.
 * Returns undefined when the argument is not a built-in name, so the caller can go on to
 * treat it as a path. Matching is case-insensitive: a theme name is not a filename.
 */
export function builtInTheme(nameOrPath: string): Theme | undefined {
  return themes[nameOrPath.trim().toLowerCase()];
}

/** What resolving a theme needs from the filesystem, so the decision can be tested without one. */
export interface ThemeIo {
  exists(path: string): boolean;
  read(path: string): string;
  parse(value: unknown): Theme;
}

/**
 * Work out which theme a render should use.
 *
 * The order is deliberate. An existing path always wins, so adding a built-in theme later can
 * never shadow a file somebody already renders with. Only when the argument is not a path is
 * it treated as a name. Passing nothing falls back to theme.json in the working directory, and
 * then to undefined, which leaves the caller's own neutral default in place.
 */
export function resolveTheme(themeArg: string | undefined, io: ThemeIo): Theme | undefined {
  if (!themeArg) {
    return io.exists("theme.json") ? io.parse(JSON.parse(io.read("theme.json"))) : undefined;
  }
  if (io.exists(themeArg)) return io.parse(JSON.parse(io.read(themeArg)));
  const named = builtInTheme(themeArg);
  if (named) return named;
  throw new Error(`No theme at ${themeArg}, and no theme by that name. Built in: ${themeNames.join(", ")}.`);
}

export { neutralTheme };
