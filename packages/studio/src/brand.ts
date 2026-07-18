import type { Theme } from "@decktrail/ir";
import { neutralTheme } from "./commands.js";

function firstMatch(re: RegExp, s: string): string | undefined {
  return re.exec(s)?.[1];
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * Extract brand tokens from a page's HTML into a theme. Best-effort and dependency-free:
 * reads a theme-color meta, CSS custom properties, a font family, and a logo, and fills
 * anything missing from the neutral theme. The generator never sees this; it is data.
 */
export function extractBrand(html: string, baseUrl = "https://example.com"): Theme {
  const theme: Theme = structuredClone(neutralTheme);
  theme.name = "Extracted brand";

  // theme-color meta (either attribute order) -> accent
  const themeColor =
    firstMatch(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i, html) ??
    firstMatch(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i, html);
  if (themeColor) theme.colors.accent = themeColor.trim();

  // CSS custom properties -> colour tokens
  const vars: Record<string, string> = {};
  const varRe = /--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(html)) !== null) {
    vars[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  // Common naming conventions, in increasing order of confidence: a later hit overwrites an
  // earlier one, so the most explicit name a site uses is the one that lands.
  //
  // This cannot be exhaustive, and it is worth saying why. A site that calls its brand colour
  // "--cyan" or "--magenta" has told us the hue and not the role, and no amount of aliasing
  // recovers the intent. Those sites extract partially and the operator fixes the rest in the
  // console Brand tab, which is what it is for.
  const colorMap: [string, keyof Theme["colors"]][] = [
    ["surface", "surfaceLow"],
    ["surface-1", "surfaceLow"],
    ["surface1", "surfaceLow"],
    ["surface-2", "surfaceHigh"],
    ["surface2", "surfaceHigh"],
    ["background", "bg"],
    ["bg", "bg"],
    ["ink", "text"],
    ["fg", "text"],
    ["foreground", "text"],
    ["text", "text"],
    ["text-color", "text"],
    ["heading", "heading"],
    ["title", "heading"],
    ["muted", "muted"],
    ["secondary-text", "muted"],
    ["brand", "accent"],
    ["brand-color", "accent"],
    ["brand-primary", "accent"],
    ["primary", "accent"],
    ["accent", "accent"],
    ["accent-2", "accent2"],
    ["accent2", "accent2"],
    ["secondary", "accent2"],
  ];
  for (const [key, target] of colorMap) {
    const value = vars[key];
    if (value) theme.colors[target] = value;
  }

  // Accent by role, when it could not be found by name.
  //
  // A site that calls its brand colour "--cyan" has named the hue, not the job. But it still
  // tells us the job somewhere: the accent is the colour its links and buttons use. So when no
  // conventional name matched, look at what anchors are actually painted with and take the
  // most-used colour that is not already doing another job here.
  if (!vars["accent"] && !vars["brand"] && !vars["primary"] && !vars["brand-color"] && !vars["brand-primary"]) {
    const taken = new Set(
      [theme.colors.bg, theme.colors.text, theme.colors.muted, theme.colors.heading].map((c) => c.toLowerCase()),
    );
    const tally = new Map<string, number>();
    // Rules whose selector contains an anchor ELEMENT, capturing the colour they set.
    //
    // The `a` has to be a real element selector. A plain \ba\b also matches ".active-a",
    // ".foo-a" and "[data-a]", none of which are links, and a wrong accent is worse than
    // none: it repaints the whole deck in a colour the site never used for anything.
    // The selector is captured without its brace, so an anchor at the end of it (".prose a")
    // is followed by nothing: the lookahead has to accept end-of-selector as well.
    const anchorSel = /(?:^|[\s,>+~])a(?=[\s,{:.[#]|$)/;
    const rule = /(^|[},])([^{}]+)\{([^}]*)\}/g;
    let r: RegExpExecArray | null;
    while ((r = rule.exec(html)) !== null) {
      if (!anchorSel.test(r[2]!)) continue;
      const decl = firstMatch(/(?:^|;)\s*color\s*:\s*([^;}]+)/i, r[3]!);
      if (!decl) continue;
      const varRef = firstMatch(/var\(\s*--([a-zA-Z0-9-]+)/i, decl);
      const value = (varRef ? vars[varRef.toLowerCase()] : /^#[0-9a-fA-F]{3,8}$/.test(decl.trim()) ? decl.trim() : undefined);
      if (!value) continue;
      const v = value.toLowerCase();
      if (taken.has(v)) continue; // already the body text or the muted tone; not an accent
      tally.set(value, (tally.get(value) ?? 0) + 1);
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) theme.colors.accent = best[0];
  }

  // Font family: a Google Fonts link, else a font-family declaration
  const googleFont = firstMatch(/fonts\.googleapis\.com\/css2?\?family=([^"'&:]+)/i, html);
  const declaredFont = firstMatch(/font-family\s*:\s*["']?([^"',;}]+)/i, html);
  const family = googleFont ? decodeURIComponent(googleFont).replace(/\+/g, " ") : declaredFont?.trim();
  if (family) theme.typography.family = family;

  // Logo: an icon link or the Open Graph image
  const logo =
    firstMatch(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i, html) ??
    firstMatch(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i, html);
  if (logo) theme.logo.src = resolveUrl(logo, baseUrl);

  return theme;
}

/** Same-origin stylesheet hrefs, in document order. */
export function stylesheetUrls(html: string, baseUrl: string, limit = 4): string[] {
  const out: string[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkRe.exec(html)) !== null && out.length < limit) {
    const t = tag[0];
    if (!/rel\s*=\s*["']?stylesheet/i.test(t)) continue;
    const href = firstMatch(/href\s*=\s*["']([^"']+)["']/i, t);
    if (!href) continue;
    const resolved = resolveUrl(href, baseUrl);
    // Same origin only. A brand lives in the site's own CSS; third-party sheets are
    // font services and trackers, and fetching them is neither useful nor our business.
    try {
      if (new URL(resolved).origin !== new URL(baseUrl).origin) continue;
    } catch {
      continue;
    }
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/**
 * Fetch a website and extract its brand into a theme.
 *
 * This follows the site's own stylesheets. It has to: essentially every real site keeps its
 * colours in a linked .css file rather than inline, so reading only the HTML document finds
 * a favicon and nothing else. Third-party sheets are skipped, and a sheet that fails to fetch
 * is ignored rather than failing the extraction.
 */
export async function fetchBrand(url: string, fetchImpl: typeof fetch = fetch): Promise<Theme> {
  const headers = { "user-agent": "DeckTrail brand extractor" };
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  const sheets = await Promise.all(
    stylesheetUrls(html, url).map(async (href) => {
      try {
        const r = await fetchImpl(href, { headers });
        return r.ok ? await r.text() : "";
      } catch {
        return "";
      }
    }),
  );

  // The document goes last so an inline theme-color or CSS variable still wins over a
  // stylesheet, which is the more specific signal about what the site actually renders.
  return extractBrand([...sheets, html].join("\n"), url);
}
