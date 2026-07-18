import type { Theme } from "@decktrail/ir";

/**
 * Turn a theme into a `:root` block of CSS (cascading style sheets) custom
 * properties. The shell CSS reads these, so one theme reskins every layout.
 */
/**
 * A base display scale applied on top of the theme's own scale.
 *
 * This is 1. It was 1.25, to make a deck fill a screen without the reader zooming, but the type
 * scale it multiplied was already a shade larger than the hand-built decks this renderer is
 * meant to match, and 25% on top overshot: headings capped at 78px against a vetted 58px, and
 * bullets wrapped after roughly 47 characters where the original ran to 76. Every layout past
 * the third slide paid for it.
 *
 * The fix is the type scale itself, now taken from the vetted decks, which are already tuned to
 * fill a screen at their own size. A reader who wants a bigger deck sets `typography.scale` on
 * the theme, which is the setting that exists for it.
 */
const BASE_SCALE = 1;

export function themeToCss(theme: Theme): string {
  const c = theme.colors;
  const vars: string[] = [
    `--bg:${c.bg}`,
    `--s-low:${c.surfaceLow}`,
    `--s-high:${c.surfaceHigh}`,
    `--accent:${c.accent}`,
    `--accent-dim:${c.accentDim}`,
    `--accent2:${c.accent2}`,
    `--accent2-dim:${c.accent2Dim}`,
    `--text:${c.text}`,
    `--heading:${c.heading}`,
    `--muted:${c.muted}`,
    `--good:${c.good ?? "#3ddc97"}`,
    `--warn:${c.warn ?? "#ffcc66"}`,
    `--bad:${c.bad ?? "#ff6b6b"}`,
    `--font:${theme.typography.family}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`,
    `--scale:${theme.typography.scale * BASE_SCALE}`,
  ];
  return `:root{${vars.join(";")}}`;
}
