import type { RichText, InlineRun } from "@decktrail/ir";

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * A link target that cannot execute script.
 *
 * escapeHtml neutralises quotes and angle brackets, so it stops an attacker breaking OUT of
 * the href attribute, and does nothing at all about what the href says. `javascript:alert(1)`
 * contains none of the escaped characters and survives untouched, and a deck's IR is written
 * by a language model from content a client supplied.
 *
 * An unrecognised scheme becomes "#" rather than being dropped, so a suspect link renders as
 * visibly inert instead of silently vanishing from the slide.
 */
export function safeHref(href: string): string {
  const h = href.trim();
  // Relative, anchor, and query links are same-document and carry no scheme to abuse.
  if (/^[#/?]/.test(h)) return h;
  return /^(https?:|mailto:|tel:)/i.test(h) ? h : "#";
}

/** Escape a plain string for safe insertion into HTML text or an attribute. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

function renderRun(r: InlineRun): string {
  const t = escapeHtml(r.text);
  switch (r.type) {
    case "text":
      return t;
    case "emphasis":
      return `<em>${t}</em>`;
    case "strong":
      return `<strong>${t}</strong>`;
    case "code":
      return `<code>${t}</code>`;
    case "highlight":
      return `<span class="grad">${t}</span>`;
    case "link":
      return `<a href="${escapeHtml(safeHref(r.href))}">${t}</a>`;
  }
}

/** Render a rich-text run list to inline HTML. All text is escaped. */
export function renderInline(rt: RichText): string {
  return rt.map(renderRun).join("");
}

/**
 * An image source that cannot execute script.
 *
 * Same reasoning as safeHref: escaping stops an attacker leaving the attribute and says nothing
 * about the scheme. An <img src> is a narrower surface than an href, but data:text/html and
 * javascript: are both accepted somewhere, and the asset comes from the IR.
 */
export function safeSrc(src: string): string {
  const s = src.trim();
  if (/^[#/?]/.test(s)) return s;
  return /^(https?:\/\/|data:image\/)/i.test(s) ? s : "";
}
