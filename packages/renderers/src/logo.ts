import type { Theme } from "@decktrail/ir";
import { escapeHtml } from "./html.js";

/**
 * Brand logo rendering. The theme carries a logo image (D16 theme model); these place it
 * on the cover (a hero mark, like the prior-art decks) and as a small persistent footer
 * mark. When the theme has no logo the deck stays brand-neutral, which is the default.
 */

/** CSS for the cover hero logo and the persistent footer brand mark. */
export const logoCss = `
.dtlogo{height:44px;width:auto;max-width:280px;align-self:flex-start;object-fit:contain;display:block;margin-bottom:22px}
/* Mark and name together on the cover, as the hand-built decks set them. */
.dtcover{display:flex;align-items:center;gap:16px;margin-bottom:34px;align-self:flex-start}
.dtcover .dtlogo{margin-bottom:0}
.dtcover .name{font-size:calc(24px * var(--scale));font-weight:800;color:var(--heading);letter-spacing:.5px}
.dtbrand{position:fixed;left:18px;bottom:16px;z-index:19;display:flex;align-items:center}
.dtbrand.up{bottom:62px}
.dtbrand img{height:22px;width:auto;display:block;opacity:.9}
.dtbarmark{height:22px;width:auto;display:block;opacity:.85;flex:none}
`;

/** Optional drop-shadow glow for the logo, from the theme (for example OrbitQube's cyan). */
function glowStyle(theme: Theme, blur: number): string {
  return theme.logo.glow ? ` style="filter:drop-shadow(0 0 ${blur}px ${escapeHtml(theme.logo.glow)})"` : "";
}

/**
 * The cover hero mark, with the company's name beside it when the theme names one, or empty
 * when the theme carries no logo. The alt text is the wordmark where there is one: a logo
 * with no name is not decorative to a reader who cannot see it.
 */
export function coverLogo(theme: Theme): string {
  if (!theme.logo.src) return "";
  const w = theme.logo.wordmark;
  const img = `<img class="dtlogo" src="${escapeHtml(theme.logo.src)}" alt="${escapeHtml(w ?? "")}"${glowStyle(theme, 12)}>`;
  if (!w) return img;
  return `<div class="dtcover">${img}<span class="name">${escapeHtml(w)}</span></div>`;
}

/**
 * The persistent footer brand mark, or empty when the theme carries none. `raised` lifts it
 * above a deck's bottom navigation bar; a scrolling document or tool leaves it at the edge.
 */
export function brandMark(theme: Theme, raised: boolean): string {
  if (!theme.logo.src) return "";
  return `<div class="dtbrand${raised ? " up" : ""}" aria-hidden="true"><img src="${escapeHtml(theme.logo.src)}" alt=""${glowStyle(theme, 8)}></div>`;
}

/**
 * The logo as it sits inside a deck's bottom bar, beside the deck's title. A deck has a bar and
 * a document does not, so a deck puts its mark in the bar rather than floating a second fixed
 * element on top of it.
 */
export function barMark(theme: Theme): string {
  if (!theme.logo.src) return "";
  return `<img class="dtbarmark" src="${escapeHtml(theme.logo.src)}" alt=""${glowStyle(theme, 8)}>`;
}
