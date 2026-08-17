import { storybookCss } from "./layout-storybook.js";
import { editorialCss } from "./layout-editorial.js";
import { crestCss } from "./layout-crest.js";
import { vividCss } from "./layout-vivid.js";

/**
 * Layouts restyle the deck shell. A layout is CSS and nothing else: it is appended after
 * `shellCss` and overrides it, so every layout renders the same markup and inherits the same
 * behaviour. Navigation, the jump menu, the progress bar, the per-viewer watermark and the
 * engagement beacon all keep working without a layout having to know they exist.
 *
 * Two rules hold the set together, and both are load bearing:
 *
 * 1. **A layout names no colour.** Every value comes from a theme token (`--accent`, `--bg`,
 *    `--text` and the rest). Layout and theme therefore compose: any of the four can be worn by
 *    any theme, rather than the two collapsing into one fixed pairing per look.
 * 2. **A layout never touches slide visibility.** `.slide{display:none}` and
 *    `.slide.active{display:flex}` belong to the shell, because that is the deck working rather
 *    than the deck looking like something. A layout that overrides them breaks navigation.
 *
 * Naming no layout is the default, and the default is the shell exactly as it was.
 */
export const layouts = Object.freeze({
  storybook: storybookCss,
  editorial: editorialCss,
  crest: crestCss,
  vivid: vividCss,
});

export type LayoutName = keyof typeof layouts;

/** The names an author may pass, in a stable order, for help text and error messages. */
export const layoutNames: readonly string[] = Object.freeze(Object.keys(layouts).sort());

/** True when the string names a layout that ships. Case insensitive: a name is not a filename. */
export function isLayoutName(name: string): name is LayoutName {
  return Object.prototype.hasOwnProperty.call(layouts, name.trim().toLowerCase());
}

/**
 * The CSS for a named layout, or the empty string for the default.
 *
 * Returning "" rather than throwing on an unknown name is deliberate at this level: the
 * renderer is a pure function and the command line is where a typo should be caught, with a
 * message that lists the choices. A renderer that threw here would turn a typo into a stack
 * trace in the middle of a publish.
 */
export function layoutCss(name?: string | null): string {
  if (!name) return "";
  const key = name.trim().toLowerCase();
  return isLayoutName(key) ? layouts[key] : "";
}
