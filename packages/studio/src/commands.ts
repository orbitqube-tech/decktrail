import { Pack, Deck, DocumentArtifact, Tool, type Theme } from "@decktrail/ir";
import { renderStandalone, renderDocument, renderHub, renderTool, fontFaceCss } from "@decktrail/renderers";

export type ValidateResult = { ok: true; kind: string } | { ok: false; error: string };

/** Validate an unknown value against the DeckTrail IR artifact schemas. */
export function runValidate(input: unknown): ValidateResult {
  if (Deck.safeParse(input).success) return { ok: true, kind: "slide-deck" };
  if (DocumentArtifact.safeParse(input).success) return { ok: true, kind: "document" };
  if (Tool.safeParse(input).success) return { ok: true, kind: "tool" };
  if (Pack.safeParse(input).success) return { ok: true, kind: "pack" };
  return { ok: false, error: "input does not match any DeckTrail IR artifact (deck, document, tool, or pack)" };
}

/** A neutral fallback theme for local rendering. Deliberately not OrbitQube. */
export const neutralTheme: Theme = {
  name: "DeckTrail Neutral",
  colors: {
    bg: "#0e0e0e",
    surfaceLow: "#141414",
    surfaceHigh: "#1e1e1e",
    accent: "#7aa2ff",
    accentDim: "#5b83e6",
    accent2: "#b98cff",
    accent2Dim: "#9a68e6",
    text: "#c9c9c9",
    heading: "#f4f4f4",
    muted: "#8a8a8a",
  },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "" },
};

export interface RenderOptions {
  /**
   * Confidentiality label, top right. Defaults to "Private & Confidential", because a deck
   * sent to a client is the overwhelmingly common case and it should not need a flag. Pass
   * null for a deck meant to be public (a talk, a portfolio piece, a marketing deck), or a
   * string to say something else.
   */
  confidentialLabel?: string | null;
}

/** Render an IR artifact (deck, document, tool, or pack) to standalone HTML. A local
 *  render of a pricing tool honours the artifact's own presenterMode, so the sender gets
 *  the interactive presenting copy; the portal always serves it locked. */
export function runRender(input: unknown, theme: Theme = neutralTheme, opts: RenderOptions = {}): string {
  // `confidentialLabel` is only forwarded when the caller actually set it, so each renderer
  // keeps applying its own default rather than receiving an explicit undefined.
  const label = "confidentialLabel" in opts ? { confidentialLabel: opts.confidentialLabel } : {};
  // The theme names a font family and nothing loaded it, so every deck rendered in whatever the
  // reader's system had. `pnpm fetch-fonts` caches the family once; this embeds it, so the deck
  // carries its own copy and a client's browser fetches nothing to open it. No cache means no
  // rule and the system face, exactly as before.
  const o = { ...label, fontCss: fontFaceCss(theme.typography.family) };
  const deck = Deck.safeParse(input);
  if (deck.success) return renderStandalone(deck.data, theme, o);
  const doc = DocumentArtifact.safeParse(input);
  if (doc.success) return renderDocument(doc.data, theme, o);
  const tool = Tool.safeParse(input);
  if (tool.success) return renderTool(tool.data, theme, o);
  const pack = Pack.safeParse(input);
  if (pack.success) return renderHub(pack.data, theme, o);

  // A file that says it is a deck and fails to parse is a deck with something wrong in it, and
  // the author is owed the something. "not a slide deck, document, tool, or pack" is true of a
  // 26-slide deck with one bad field, and useless: it reads as though the file is the wrong kind
  // of thing entirely. The schema knows exactly which path is at fault, so say it.
  const kind = (input as { kind?: unknown })?.kind;
  const claimed =
    kind === "slide-deck" ? deck : kind === "document" ? doc : kind === "tool" ? tool : kind === "hub" ? pack : null;
  if (claimed && !claimed.success) {
    const where = claimed.error.issues
      .slice(0, 5)
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const more = claimed.error.issues.length > 5 ? `\n  ...and ${claimed.error.issues.length - 5} more` : "";
    throw new Error(`cannot render this ${String(kind)}:\n${where}${more}`);
  }
  throw new Error("cannot render: input is not a slide deck, document, tool, or pack");
}
