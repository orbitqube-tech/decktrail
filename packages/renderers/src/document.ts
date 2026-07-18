import type { DocumentArtifact, Theme, Block, ProseContent, RichText } from "@decktrail/ir";
import { escapeHtml, renderInline, safeHref } from "./html.js";
import { sanitizeFigure } from "./sanitize.js";
import { themeToCss } from "./theme.js";
import { shellCss, renderMadeWith } from "./shell.js";
import { htmlDocument } from "./page.js";
import { watermarkCss, watermarkLayer, antiCopyCss, antiCopyJs } from "./watermark.js";
import { beaconConfigTag, beaconJs, type BeaconConfig } from "./beacon.js";
import { logoCss, brandMark } from "./logo.js";

/** Document-mode CSS. Reuses shell component styles (table, callout) and adds scrolling. */
export const documentCss = `
body{background-attachment:fixed}
.wrap{max-width:940px;margin:0 auto;padding:64px 24px 120px}
.wrap>.eyebrow{margin-bottom:14px}
.wrap h1{font-size:calc(clamp(28px,4vw,44px) * var(--scale));color:var(--heading);font-weight:900;letter-spacing:-1px;margin-bottom:24px}
.block{margin:0 0 30px}
.block h2{font-size:calc(clamp(20px,2.4vw,28px) * var(--scale));color:var(--heading);margin-bottom:12px}
.prose p{color:var(--text);line-height:1.65;margin:0 0 14px;max-width:72ch}
.prose ul,.prose ol{margin:0 0 14px 22px;color:var(--text);line-height:1.6}
.prose blockquote{border-left:3px solid var(--accent);padding-left:16px;color:var(--muted);margin:0 0 14px}
.prose blockquote footer{color:var(--muted);font-size:.9em;margin-top:6px}
.prose code{background:var(--s-low);padding:2px 6px;border-radius:6px;font-size:.9em}
.codeblock{margin:0 0 16px}
.codeblock .cap{color:var(--muted);font-size:calc(13px * var(--scale));margin-bottom:6px}
.codeblock pre{background:var(--s-low);border-radius:10px;padding:16px;overflow-x:auto;color:var(--text);font-size:calc(14px * var(--scale));line-height:1.5}
.tablewrap{overflow-x:auto;margin:0 0 8px}
.toc{list-style:decimal;margin:0 0 8px 24px;color:var(--text);line-height:1.9}
.toc .lbl{color:var(--heading)}
.toc .note{color:var(--muted);margin-left:10px;font-size:.9em}
.ranked{list-style:none;counter-reset:r;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.ranked li{counter-increment:r;position:relative;padding-left:46px;min-height:30px}
.ranked li::before{content:counter(r);position:absolute;left:0;top:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--s-high);color:var(--accent);font-weight:800;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 22%,transparent)}
.ranked .t{color:var(--heading);font-weight:600}
.ranked .b{color:var(--text);margin-top:2px;line-height:1.5}
.twopanel{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 8px}
.twopanel .panel{background:var(--s-high);border-radius:14px;padding:18px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 14%,transparent)}
.twopanel .panel h3{color:var(--heading);margin-bottom:8px;font-size:calc(17px * var(--scale))}
.gaps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.gaps li{display:flex;gap:12px;align-items:flex-start}
.gaps .dot{flex:0 0 auto;width:10px;height:10px;border-radius:3px;margin-top:6px;background:var(--muted)}
.gaps li.good .dot{background:var(--good)}.gaps li.warn .dot{background:var(--warn)}.gaps li.bad .dot{background:var(--bad)}
.gaps .i{color:var(--heading)}
.gaps .n{color:var(--muted);font-size:.92em;margin-top:2px;line-height:1.5}
.srcnote{border-left:3px solid color-mix(in srgb,var(--muted) 50%,transparent);padding:8px 14px;color:var(--muted);font-size:calc(13px * var(--scale));margin:0 0 8px;line-height:1.5}
.srcnote .lbl{color:var(--text);font-weight:700;margin-right:8px;text-transform:uppercase;letter-spacing:1px;font-size:.85em}
.srcnote a{color:var(--accent);word-break:break-all}
@media(max-width:640px){.twopanel{grid-template-columns:1fr}}
`;

function renderProse(content: ProseContent): string {
  return content
    .map((b) => {
      switch (b.type) {
        case "paragraph":
          return `<p>${renderInline(b.content)}</p>`;
        case "list": {
          const items = b.items.map((i) => `<li>${renderInline(i)}</li>`).join("");
          return b.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        }
        case "blockquote":
          return `<blockquote>${renderInline(b.content)}${b.attribution ? `<footer>${escapeHtml(b.attribution)}</footer>` : ""}</blockquote>`;
      }
    })
    .join("");
}

function figureBlock(f: { svg?: string; html?: string; caption?: string }): string {
  // The one place a document carries markup that came from neither a layout nor escapeHtml, so
  // it goes through the allowlist. See sanitize.ts for what survives it, and why widening it is
  // a decision rather than a convenience.
  const inner = sanitizeFigure(f.svg ?? f.html ?? "");
  const cap = f.caption ? `<figcaption class="figcap">${escapeHtml(f.caption)}</figcaption>` : "";
  return `<figure class="shot">${inner}${cap}</figure>`;
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "prose-section": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      return `<div class="block">${h}<div class="prose">${renderProse(b.body)}</div></div>`;
    }
    case "long-table": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      const head = `<tr>${b.columns
        .map((c) => `<th>${renderInline(c.label)}${c.sub ? `<div class="footnote">${escapeHtml(c.sub)}</div>` : ""}</th>`)
        .join("")}</tr>`;
      const rows = b.rows.map((r) => `<tr>${r.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("");
      const totals = b.totals ? `<tfoot><tr>${b.totals.map((t) => `<td>${renderInline(t)}</td>`).join("")}</tr></tfoot>` : "";
      const foot = b.footnote ? `<div class="footnote">${escapeHtml(b.footnote)}</div>` : "";
      return `<div class="block">${h}<div class="tablewrap"><table class="st"><thead>${head}</thead><tbody>${rows}</tbody>${totals}</table></div>${foot}</div>`;
    }
    case "code-block": {
      const cap = b.caption ? `<div class="cap">${escapeHtml(b.caption)}</div>` : "";
      const out = b.expectedOutput ? `<pre><code>${escapeHtml(b.expectedOutput)}</code></pre>` : "";
      return `<div class="block codeblock">${cap}<pre><code>${escapeHtml(b.code)}</code></pre>${out}</div>`;
    }
    case "image": {
      const cap = b.caption ? `<figcaption class="figcap">${escapeHtml(b.caption)}</figcaption>` : "";
      return `<div class="block"><figure class="shot"><img src="${escapeHtml(b.asset)}" alt="${escapeHtml(b.alt)}">${cap}</figure></div>`;
    }
    case "figure":
      return `<div class="block">${figureBlock(b)}</div>`;
    case "toc": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      const items = b.entries
        .map((e) => `<li><span class="lbl">${renderInline(e.label)}</span>${e.note ? `<span class="note">${escapeHtml(e.note)}</span>` : ""}</li>`)
        .join("");
      return `<div class="block">${h}<ol class="toc">${items}</ol></div>`;
    }
    case "ranked-list": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      const items = b.items
        .map((i) => `<li><div class="t">${renderInline(i.title)}</div>${i.body ? `<div class="b">${renderInline(i.body)}</div>` : ""}</li>`)
        .join("");
      return `<div class="block">${h}<ol class="ranked">${items}</ol></div>`;
    }
    case "two-panel": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      const panel = (p: { title: import("@decktrail/ir").RichText; body: ProseContent }) =>
        `<div class="panel"><h3>${renderInline(p.title)}</h3><div class="prose">${renderProse(p.body)}</div></div>`;
      return `<div class="block">${h}<div class="twopanel">${panel(b.left)}${panel(b.right)}</div></div>`;
    }
    case "known-gaps": {
      const h = b.heading ? `<h2>${renderInline(b.heading)}</h2>` : "";
      const items = b.gaps
        .map(
          (g) =>
            `<li class="${g.state ?? ""}"><span class="dot"></span><div><div class="i">${renderInline(g.item)}</div>${g.note ? `<div class="n">${renderInline(g.note)}</div>` : ""}</div></li>`,
        )
        .join("");
      return `<div class="block">${h}<ul class="gaps">${items}</ul></div>`;
    }
    case "source-note": {
      const label = b.label ? `<span class="lbl">${escapeHtml(b.label)}</span>` : "";
      const link = b.href ? ` <a href="${escapeHtml(b.href)}">${escapeHtml(b.href)}</a>` : "";
      return `<div class="block"><div class="srcnote">${label}${renderInline(b.body)}${link}</div></div>`;
    }
  }
}

export interface DocumentOptions {
  eyebrow?: string;
  confidentialLabel?: string | null;
  madeWith?: { label: string; href?: string } | null;
  watermark?: { text: string; opacity?: number } | null;
  protect?: boolean;
  /** Engagement beacon config. Set by the portal renderer; absent in a standalone file. */
  beacon?: BeaconConfig | null;
  lang?: string;
  /** @font-face CSS for the theme's family, from fontFaceCss(). See StandaloneOptions.fontCss. */
  fontCss?: string;
}

/** Render a scrolling document artifact to one self-contained HTML file. */
export function renderDocument(doc: DocumentArtifact, theme: Theme, opts: DocumentOptions = {}): string {
  const confidential = opts.confidentialLabel === undefined ? "Private & Confidential" : opts.confidentialLabel;

  const blocks = doc.blocks.map(renderBlock).join("");
  const eyebrow = opts.eyebrow ? `<div class="eyebrow">${escapeHtml(opts.eyebrow)}</div>` : "";
  const confHtml = confidential ? `<div class="confidential">${escapeHtml(confidential)}</div>` : "";
  const madeHtml = renderMadeWith(opts.madeWith, false);
  const wmHtml = opts.watermark ? watermarkLayer(opts.watermark.text) : "";

  const css =
    (opts.fontCss ?? "") +
    themeToCss(theme) +
    shellCss +
    documentCss +
    (theme.logo.src ? logoCss : "") +
    (opts.watermark ? watermarkCss(opts.watermark.opacity ?? 0.16) : "") +
    (opts.protect ? antiCopyCss : "");
  const scripts = (opts.protect ? antiCopyJs : "") + (opts.beacon ? beaconJs : "");
  const beaconTag = opts.beacon ? beaconConfigTag(opts.beacon) : "";

  const body = `${confHtml}<div class="wrap">${eyebrow}<h1>${escapeHtml(doc.title)}</h1>${blocks}</div>${brandMark(theme, false)}${madeHtml}${wmHtml}${beaconTag}`;
  return htmlDocument({ title: doc.title, lang: opts.lang, css, body, scripts: scripts || undefined });
}
