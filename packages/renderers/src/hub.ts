import type { Pack, Theme } from "@decktrail/ir";
import { escapeHtml } from "./html.js";
import { themeToCss } from "./theme.js";
import { shellCss } from "./shell.js";
import { documentCss } from "./document.js";
import { htmlDocument } from "./page.js";

export interface HubOptions {
  /** Map an artifact slug to its href. Default `./<slug>`. */
  linkFor?: (slug: string) => string;
  confidentialLabel?: string | null;
  madeWith?: { label: string; href?: string } | null;
  lang?: string;
  /** @font-face CSS for the theme's family, from fontFaceCss(). See StandaloneOptions.fontCss. */
  fontCss?: string;
}

/** Render the pack's hub: an index of artifact link tiles (docs/IR-SPEC.md section 6). */
export function renderHub(pack: Pack, theme: Theme, opts: HubOptions = {}): string {
  const linkFor = opts.linkFor ?? ((slug: string) => `./${slug}`);
  const confidential = opts.confidentialLabel === undefined ? "Private & Confidential" : opts.confidentialLabel;
  const madeWith = opts.madeWith === undefined ? { label: "Made with DeckTrail" } : opts.madeWith;

  const tiles = pack.artifacts
    .map((a, idx) => {
      const ordinal = String(idx + 1).padStart(2, "0");
      const tag = a.audience ? `<span class="tag">${escapeHtml(a.audience)}</span>` : "";
      const blurb = a.blurb ? `<p>${escapeHtml(a.blurb)}</p>` : "";
      return `<a class="card" href="${escapeHtml(linkFor(a.slug))}">${tag}<h3>${escapeHtml(ordinal)} ${escapeHtml(a.title)}</h3>${blurb}</a>`;
    })
    .join("");

  const cols = Math.min(Math.max(pack.artifacts.length, 2), 3);
  const confHtml = confidential ? `<div class="confidential">${escapeHtml(confidential)}</div>` : "";
  const madeHtml = madeWith
    ? madeWith.href
      ? `<a class="madewith" href="${escapeHtml(madeWith.href)}">${escapeHtml(madeWith.label)}</a>`
      : `<span class="madewith">${escapeHtml(madeWith.label)}</span>`
    : "";

  const css = (opts.fontCss ?? "") + themeToCss(theme) + shellCss + documentCss;
  const body = `${confHtml}<div class="wrap"><h1>${escapeHtml(pack.title)}</h1><div class="grid c${cols}">${tiles}</div></div>${madeHtml}`;
  return htmlDocument({ title: pack.title, lang: opts.lang, css, body });
}
