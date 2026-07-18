import type { Deck, Theme } from "@decktrail/ir";
import { themeToCss } from "./theme.js";
import { shellCss, shellJs, renderMadeWith } from "./shell.js";
import { renderSlide } from "./slides.js";
import { escapeHtml } from "./html.js";
import { htmlDocument } from "./page.js";
import { watermarkCss, watermarkLayer, antiCopyCss, antiCopyJs } from "./watermark.js";
import { beaconConfigTag, beaconJs, type BeaconConfig } from "./beacon.js";
import { logoCss, barMark } from "./logo.js";

export { logoCss, coverLogo, brandMark, barMark } from "./logo.js";
export { beaconConfigTag, beaconJs, type BeaconConfig } from "./beacon.js";
export { escapeHtml, renderInline } from "./html.js";
export { themeToCss } from "./theme.js";
export { fontFaceCss, fontSlug, clearFontCache } from "./font.js";
export { renderSlide } from "./slides.js";
export { shellCss, shellJs, renderMadeWith } from "./shell.js";
export { htmlDocument, type PageParts } from "./page.js";
export { renderDocument, documentCss, type DocumentOptions } from "./document.js";
export { renderTool, toolCss, type ToolOptions } from "./tool.js";
export { renderHub, type HubOptions } from "./hub.js";
export { renderPortalDeck, renderPortalDocument, renderPortalTool, type Viewer } from "./portal.js";
export {
  watermarkText,
  watermarkCss,
  watermarkLayer,
  antiCopyCss,
  antiCopyJs,
  type WatermarkTokens,
} from "./watermark.js";

export interface StandaloneOptions {
  /** Confidentiality label, top-right. Default "Private & Confidential"; null to omit. */
  confidentialLabel?: string | null;
  /** The "made with" mark (D12). Default a plain DeckTrail label; null to omit. */
  madeWith?: { label: string; href?: string } | null;
  /** Per-viewer watermark overlay. Set by the portal renderer, not the standalone one. */
  watermark?: { text: string; opacity?: number } | null;
  /** Anti-copy friction. Set by the portal renderer. */
  protect?: boolean;
  /** Engagement beacon config. Set by the portal renderer; absent in a standalone file. */
  beacon?: BeaconConfig | null;
  /** Document language attribute. Default "en". */
  lang?: string;
  /**
   * -face CSS embedding the theme's font family, from fontFaceCss(). Optional: without it a
   * deck renders in the system face, which is a different typeface at weight 900 and a different
   * measure, since a ch is the width of a zero in the font in use. Passed in rather than read
   * here so that a render stays a function of its arguments.
   */
  fontCss?: string;
}

/**
 * Render a slide deck to one self-contained HTML file (the `standalone` renderer).
 * Theme is applied at build time. The per-viewer watermark and anti-copy friction are
 * off by default here and switched on by the portal renderer (see portal.ts and
 * docs/ARCHITECTURE.md section 4).
 */
export function renderStandalone(deck: Deck, theme: Theme, opts: StandaloneOptions = {}): string {
  const confidential = opts.confidentialLabel === undefined ? "Private & Confidential" : opts.confidentialLabel;

  const slides = deck.slides.map((s) => renderSlide(s, theme)).join("");
  const confHtml = confidential ? `<div class="confidential">${escapeHtml(confidential)}</div>` : "";
  // Placed into the bar rather than floating: a deck has a bar, and two things laying claim to
  // the same corner can only collide. Documents and tools have no bar and keep the edge position.
  const madeHtml = renderMadeWith(opts.madeWith, false);
  const wmHtml = opts.watermark ? watermarkLayer(opts.watermark.text) : "";
  const beaconTag = opts.beacon ? beaconConfigTag(opts.beacon) : "";

  const css =
    (opts.fontCss ?? "") +
    themeToCss(theme) +
    shellCss +
    (theme.logo.src ? logoCss : "") +
    (opts.watermark ? watermarkCss(opts.watermark.opacity ?? 0.16) : "") +
    (opts.protect ? antiCopyCss : "");
  const scripts = shellJs + (opts.protect ? antiCopyJs : "") + (opts.beacon ? beaconJs : "");

  // The bar in three parts: who made the tool at the far left, whose deck this is in the middle,
  // and where you are in it plus the way through at the right. Everything that was floating over
  // the bar is now in it, because two fixed things sharing a corner can only collide.
  const body = `<div class="progress" id="prog"></div>
${confHtml}
<div class="deck" id="deck">${slides}</div>
<div class="bar-nav">
<div class="b-left">${madeHtml}</div>
<div class="b-mid">${barMark(theme)}<span class="t">${escapeHtml(deck.title)}</span></div>
<div class="b-right"><span class="counter" id="counter"></span><button class="nav" id="prev" aria-label="Previous">&#8249;</button><button class="nav" id="next" aria-label="Next">&#8250;</button></div>
</div>
${wmHtml}${beaconTag}`;

  return htmlDocument({ title: deck.title, lang: opts.lang, css, body, scripts });
}
