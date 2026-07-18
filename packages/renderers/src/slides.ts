import type { Slide, CalloutBand, Tone, Theme } from "@decktrail/ir";
import { escapeHtml, renderInline, safeSrc } from "./html.js";
import { sanitizeFigure } from "./sanitize.js";
import { coverLogo } from "./logo.js";
import { renderFlowchart } from "./flowchart.js";

function toneClass(tone: Tone): string {
  return tone === "neutral" ? "" : ` ${tone}`;
}

/**
 * The key under a diagram. Shared by the swimlane and the flowchart, which both have one.
 *
 * `dots` colours each entry from the thing it names, when the caller has one per entry. Without
 * it the first three take the accent, the second accent and the warning colour, which is a guess
 * but a consistent one.
 */
function legendHtml(legend: string[] | undefined, dots?: (string | undefined)[]): string {
  if (!legend?.length) return "";
  const items = legend
    .map((l, i) => {
      const dot = dots?.[i];
      const style = dot ? ` style="background:${escapeHtml(dot)}"` : "";
      const cls = !dot && i === 1 ? ' class="d2"' : !dot && i === 2 ? ' class="d3"' : "";
      return `<span><i${cls}${style}></i>${escapeHtml(l)}</span>`;
    })
    .join("");
  return `<div class="legend">${items}</div>`;
}

function calloutHtml(band: CalloutBand | undefined): string {
  if (!band) return "";
  return `<div class="callout${toneClass(band.tone)}">${renderInline(band.body)}</div>`;
}

function eyebrowHtml(eyebrow: string | undefined): string {
  return eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : "";
}

function figureHtml(f: { svg?: string; html?: string; caption?: string }): string {
  const inner = sanitizeFigure(f.svg ?? f.html ?? "");
  const cap = f.caption ? `<figcaption class="figcap">${escapeHtml(f.caption)}</figcaption>` : "";
  return `<figure class="shot">${inner}${cap}</figure>`;
}

function bodyOf(slide: Slide): string {
  switch (slide.layout) {
    case "bullets": {
      const lede = slide.lede ? `<p class="lede">${renderInline(slide.lede)}</p>` : "";
      const items = slide.items.map((it) => `<li>${renderInline(it)}</li>`).join("");
      return `<h2>${renderInline(slide.heading)}</h2>${lede}<ul class="points">${items}</ul>`;
    }
    case "cover": {
      const sub = slide.sub ? `<p class="sub">${renderInline(slide.sub)}</p>` : "";
      const meta = [
        slide.preparedFor ? `<span>Prepared for ${escapeHtml(slide.preparedFor)}</span>` : "",
        slide.date ? `<span>${escapeHtml(slide.date)}</span>` : "",
        slide.contact ? `<span>${escapeHtml(slide.contact)}</span>` : "",
      ].filter(Boolean).join("");
      return `<h1>${renderInline(slide.heading)}</h1>${sub}${meta ? `<div class="meta">${meta}</div>` : ""}`;
    }
    case "close": {
      const sub = slide.sub ? `<p class="sub">${renderInline(slide.sub)}</p>` : "";
      const contact = slide.contact ? `<div class="meta"><span>${escapeHtml(slide.contact)}</span></div>` : "";
      return `<h1>${renderInline(slide.heading)}</h1>${sub}${contact}`;
    }
    case "statement": {
      const sub = slide.sub ? `<p class="sub">${renderInline(slide.sub)}</p>` : "";
      return `<h2>${renderInline(slide.heading)}</h2>${sub}`;
    }
    case "card-grid": {
      // One row where the cards fit in one, rather than a grid with a hole at the end: five
      // cards fell to three-and-two before five was allowed.
      const cols = slide.columns ?? Math.min(Math.max(slide.cards.length, 2), 5);
      const cards = slide.cards.map((c) => {
        const icon = c.icon ? `<div class="ico" aria-hidden="true">${escapeHtml(c.icon)}</div>` : "";
        const tag = c.tag ? `<span class="tag">${escapeHtml(c.tag)}</span>` : "";
        const bullets = c.bullets ? `<ul>${c.bullets.map((b) => `<li>${renderInline(b)}</li>`).join("")}</ul>` : "";
        return `<div class="card">${icon}${tag}<h3>${renderInline(c.title)}</h3><p>${renderInline(c.body)}</p>${bullets}</div>`;
      }).join("");
      return `<h2>${renderInline(slide.heading)}</h2><div class="grid c${cols}">${cards}</div>`;
    }
    case "table": {
      const head = `<tr>${slide.columns.map((col) => `<th>${renderInline(col)}</th>`).join("")}</tr>`;
      const rows = slide.rows.map((r) => `<tr>${r.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("");
      const totals = slide.totals ? `<tfoot><tr>${slide.totals.map((t) => `<td>${renderInline(t)}</td>`).join("")}</tr></tfoot>` : "";
      const foot = slide.footnote ? `<div class="footnote">${escapeHtml(slide.footnote)}</div>` : "";
      return `<h2>${renderInline(slide.heading)}</h2><table class="st"><thead>${head}</thead><tbody>${rows}</tbody>${totals}</table>${foot}`;
    }
    case "steps": {
      const heading = slide.heading ? `<h2>${renderInline(slide.heading)}</h2>` : "";
      // One colour per distinct actor, in order of appearance, so the same actor keeps the same
      // pill across the row. Four classes then it wraps: past four the colour stops telling
      // anyone anything.
      const tags = [...new Set(slide.steps.map((s) => s.actorTag).filter(Boolean))] as string[];
      const tagClass = (t: string) => {
        const i = tags.indexOf(t) % 4;
        return i === 0 ? "" : ` t${i + 1}`;
      };
      const steps = slide.steps.map((s) => {
        // The label is a fallback tag: a step with neither is just a card, which is fine.
        const label = s.actorTag ?? s.label;
        const tag = label ? `<div class="tag${s.actorTag ? tagClass(s.actorTag) : ""}">${escapeHtml(label)}</div>` : "";
        return `<div class="fstep">${tag}<h3>${renderInline(s.title)}</h3><p>${renderInline(s.body)}</p></div>`;
      }).join("");
      return `${heading}<div class="flow">${steps}</div>`;
    }
    case "comparison": {
      const col = (c: { title: import("@decktrail/ir").RichText; body: import("@decktrail/ir").RichText }) =>
        `<div class="card"><h3>${renderInline(c.title)}</h3><p>${renderInline(c.body)}</p></div>`;
      return `<h2>${renderInline(slide.heading)}</h2><div class="two">${col(slide.left)}${col(slide.right)}</div>`;
    }
    case "callout": {
      return `<div class="callout${toneClass(slide.tone)}">${renderInline(slide.body)}</div>`;
    }
    case "timeline": {
      const rows = slide.phases.map((p) => {
        const out = p.output ? `<td>${renderInline(p.output)}</td>` : "<td></td>";
        const range = p.range ? `<td>${escapeHtml(p.range)}</td>` : "<td></td>";
        return `<tr><td>${escapeHtml(p.label)}</td><td>${renderInline(p.what)}</td>${out}${range}</tr>`;
      }).join("");
      return `<h2>${renderInline(slide.heading)}</h2><table class="st"><thead><tr><th>Phase</th><th>What</th><th>Output</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    case "chart": {
      const max = slide.scale ?? Math.max(...slide.series.map((s) => s.value), 1);
      const bars = slide.series.map((s) => {
        const pct = max > 0 ? Math.round((s.value / max) * 100) : 0;
        return `<div class="bar"><div class="lbl">${escapeHtml(s.label)}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div><div class="val">${escapeHtml(String(s.value))}</div></div>`;
      }).join("");
      return `<h2>${renderInline(slide.heading)}</h2><div class="chart">${bars}</div>`;
    }
    case "stat-grid": {
      const stats = slide.stats.map((s) => {
        const state = s.state ? ` ${s.state}` : "";
        return `<div class="stat"><div class="v${state}">${escapeHtml(s.value)}</div><div class="k">${escapeHtml(s.label)}</div></div>`;
      }).join("");
      return `<h2>${renderInline(slide.heading)}</h2><div class="stats">${stats}</div>`;
    }
    case "swimlane": {
      const heading = slide.heading ? `<h2>${renderInline(slide.heading)}</h2>` : "";
      // One column for the actor names, then one per stage. The count is not fixed: a lane grid
      // is as wide as the process is long.
      const cols = `grid-template-columns:minmax(110px,132px) repeat(${slide.stages.length},1fr)`;
      const head = `<div></div>${slide.stages.map((st) => `<div class="h">${escapeHtml(st)}</div>`).join("")}`;
      const rows = slide.actors.map((a) => {
        // A dot the theme did not name falls back to the accent, via the class default.
        const dot = a.dot ? ` style="background:${escapeHtml(a.dot)}"` : "";
        const name = `<div class="a"><i class="d"${dot}></i><span>${escapeHtml(a.name)}</span></div>`;
        const cells = slide.stages.map((st) => {
          const cell = slide.cells.find((c) => c.actor === a.name && c.stage === st);
          if (!cell?.body) return `<div class="c dim">&middot;</div>`;
          return `<div class="c${cell.state ? ` ${cell.state}` : ""}">${renderInline(cell.body)}</div>`;
        }).join("");
        return name + cells;
      }).join("");
      // A legend with one entry per actor is naming the actors, so it takes their dot colours
      // rather than a colour picked by position, which disagreed with the grid above it.
      const dots = slide.legend?.length === slide.actors.length ? slide.actors.map((a) => a.dot) : undefined;
      return `${heading}<div class="lane" style="${cols}">${head}${rows}</div>${legendHtml(slide.legend, dots)}`;
    }
    case "flowchart": {
      const heading = slide.heading ? `<h2>${renderInline(slide.heading)}</h2>` : "";
      // Drawn as SVG with computed coordinates (flowchart.ts). The CSS version could only join a
      // node to the one beside it, which left the turn between rows undrawn, the branch out of a
      // decision as a line of text, and a loop as a badge.
      const svg = renderFlowchart(slide.nodes, slide.edges, slide.decisions ?? []);
      const legend = legendHtml(slide.legend);
      return `${heading}${svg}${legend}`;
    }
    case "tool-visual": {
      const heading = slide.heading ? `<h2>${renderInline(slide.heading)}</h2>` : "";
      const mocks = slide.mocks.map(figureHtml).join("");
      return `${heading}<div class="grid c2">${mocks}</div>`;
    }
    case "image": {
      const cap = slide.caption ? `<figcaption class="figcap">${escapeHtml(slide.caption)}</figcaption>` : "";
      return `<figure class="shot"><img src="${escapeHtml(safeSrc(slide.asset))}" alt="${escapeHtml(slide.alt)}">${cap}</figure>`;
    }
    case "figure": {
      return figureHtml(slide);
    }
  }
}

/** Render one slide to a `<section class="slide">` element. The theme is optional; when it
 *  carries a logo, the cover slide leads with it as a hero mark. */
export function renderSlide(slide: Slide, theme?: Theme): string {
  const eyebrow = "eyebrow" in slide ? eyebrowHtml(slide.eyebrow) : "";
  const trailing = slide.layout === "callout" ? "" : calloutHtml(slide.callout);
  const logo = slide.layout === "cover" && theme ? coverLogo(theme) : "";
  return `<section class="slide" data-slide-id="${escapeHtml(slide.id)}">${logo}${eyebrow}${bodyOf(slide)}${trailing}</section>`;
}
