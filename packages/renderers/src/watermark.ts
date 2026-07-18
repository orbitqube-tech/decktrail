import type { WatermarkConfig } from "@decktrail/ir";
import { escapeHtml } from "./html.js";

export interface WatermarkTokens {
  recipient?: string;
  timestamp?: string;
  label?: string;
}

/**
 * Compose the per-viewer watermark text from the self-hoster's config (D14) and the
 * viewer tokens. A `template` with `{recipient}`, `{timestamp}`, `{label}` placeholders
 * wins; otherwise the configured `fields` are joined.
 */
export function watermarkText(config: WatermarkConfig, tokens: WatermarkTokens): string {
  const label = tokens.label ?? config.label;
  if (config.template) {
    return config.template
      .replace(/\{recipient\}/g, tokens.recipient ?? "")
      .replace(/\{timestamp\}/g, tokens.timestamp ?? "")
      .replace(/\{label\}/g, label);
  }
  return config.fields
    .map((f) => (f === "recipient" ? tokens.recipient : f === "timestamp" ? tokens.timestamp : f === "label" ? label : "") ?? "")
    .filter(Boolean)
    .join("  ");
}

export function watermarkCss(opacity: number): string {
  return `#dtwm{position:fixed;inset:0;z-index:15;pointer-events:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:120px 40px;opacity:${opacity};overflow:hidden}
#dtwm span{transform:rotate(-24deg);color:var(--muted);font-size:13px;white-space:nowrap;text-align:center}`;
}

/** A tiled, faint, per-viewer watermark overlay. Injected server-side at serve time. */
export function watermarkLayer(text: string, tiles = 60): string {
  const t = escapeHtml(text);
  const spans = Array.from({ length: tiles }, () => `<span>${t}</span>`).join("");
  return `<div id="dtwm" aria-hidden="true">${spans}</div>`;
}

/** Anti-copy friction (docs/ARCHITECTURE.md section 5, honest limitation stated in the threat model). */
export const antiCopyCss = `body.dtprotect{-webkit-user-select:none;user-select:none}
@media print{body.dtprotect .deck,body.dtprotect .wrap{display:none!important}body.dtprotect::after{content:"This document is confidential and not intended for printing.";color:#000}}`;

export const antiCopyJs = `document.body.classList.add('dtprotect');
['contextmenu','copy','cut','dragstart'].forEach(function(e){document.addEventListener(e,function(ev){ev.preventDefault()})});`;
