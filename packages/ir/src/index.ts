/**
 * DeckTrail deck intermediate representation (IR).
 *
 * The single source of truth for every artifact DeckTrail serves. Defined as Zod
 * schemas so one definition yields both a runtime validator and a static TypeScript
 * type. See docs/IR-SPEC.md (v0.2) and docs/DECISIONS.md D6, D16, D17.
 *
 * This is the Wave 1 (Pack MVP) surface. Deferred layouts and blocks (docs/IR-SPEC.md
 * sections 4 and 5) are added as fast-follows.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Rich text (docs/IR-SPEC.md section 3.1)
 * ------------------------------------------------------------------ */

/** One inline run of text, optionally styled. Flat for now; nesting is deferred. */
export const InlineRun = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("emphasis"), text: z.string() }),
  z.object({ type: z.literal("strong"), text: z.string() }),
  z.object({ type: z.literal("code"), text: z.string() }),
  z.object({ type: z.literal("highlight"), text: z.string() }),
  z.object({ type: z.literal("link"), text: z.string(), href: z.string() }),
]);
export type InlineRun = z.infer<typeof InlineRun>;

/**
 * A span of styled inline text, used in headings, ledes, bodies, and table cells. A plain
 * string is accepted as shorthand for a single text run, so hand-authored IR can write
 * `heading: "Hello"` instead of `heading: [{ type: "text", text: "Hello" }]`. The run array
 * is still accepted, for inline emphasis, code, and links.
 */
/**
 * Inline text: a plain string, or a list of runs.
 *
 * Non-empty, and that is the point. `[]` is a perfectly good `InlineRun[]`, so `title: []` used
 * to validate and a card with no title and no body sailed through to the slide as an empty box.
 * Rich text that says nothing is not rich text; a slot that has nothing to say should be left
 * out, and the schema is where that is decided (constrain at the boundary, not at the renderer).
 */
export const RichText = z.union([
  z
    .string()
    .trim()
    .min(1, "text cannot be empty: leave the slot out instead")
    .transform((s): InlineRun[] => [{ type: "text", text: s }]),
  z
    .array(InlineRun)
    .min(1, "text cannot be empty: leave the slot out instead")
    .refine((runs) => runs.some((r) => r.text.trim() !== ""), "text cannot be only whitespace"),
]);
export type RichText = z.infer<typeof RichText>;

/** Block-level rich content, used inside document prose sections. One level deep. */
export const ProseBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), content: RichText }),
  z.object({ type: z.literal("list"), ordered: z.boolean().default(false), items: z.array(RichText) }),
  z.object({ type: z.literal("blockquote"), content: RichText, attribution: z.string().optional() }),
]);
export type ProseBlock = z.infer<typeof ProseBlock>;

export const ProseContent = z.array(ProseBlock);
export type ProseContent = z.infer<typeof ProseContent>;

/* ------------------------------------------------------------------ *
 * Shared tokens
 * ------------------------------------------------------------------ */

/** Callout tone (docs/IR-VALIDATION.md section 7). */
export const Tone = z.enum(["neutral", "red", "green", "note"]);
export type Tone = z.infer<typeof Tone>;

/** Semantic colour state for stats and status cells. */
export const State = z.enum(["good", "warn", "bad"]);
export type State = z.infer<typeof State>;

/** A callout band appended after a slide's main content. */
export const CalloutBand = z.object({ body: RichText, tone: Tone.default("neutral") });
export type CalloutBand = z.infer<typeof CalloutBand>;

/* ------------------------------------------------------------------ *
 * Theme (brand, per artifact) and Voice (register, generation-time)
 * ------------------------------------------------------------------ */

/**
 * A CSS colour, and nothing else.
 *
 * Every one of these is interpolated straight into a <style> element (renderers/theme.ts into
 * page.ts), so an unconstrained string here is script execution on the portal's own origin,
 * for every recipient of the deck. It is not a theoretical path: `decktrail brand <url>` reads
 * these values out of a THIRD PARTY's stylesheet, writes them to theme.json unreviewed, and
 * the portal serves the result. A value of `red}</style><script>...` closes the element.
 *
 * Constrained at the schema rather than escaped at the renderer because this is the boundary:
 * everything downstream, including the console and the publish route, validates through here.
 */
const CssColor = z
  .string()
  .trim()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-zA-Z]{3,20})$/,
    "not a CSS colour: use a hex value, rgb()/rgba(), hsl()/hsla(), or a named colour",
  );

export const Theme = z.object({
  name: z.string(),
  colors: z.object({
    bg: CssColor,
    surfaceLow: CssColor,
    surfaceHigh: CssColor,
    accent: CssColor,
    accentDim: CssColor,
    accent2: CssColor,
    accent2Dim: CssColor,
    text: CssColor,
    heading: CssColor,
    muted: CssColor,
    good: CssColor.optional(),
    warn: CssColor.optional(),
    bad: CssColor.optional(),
  }),
  typography: z.object({
    // Also interpolated into a <style> element, so it is constrained for the same reason as
    // CssColor: letters, digits, spaces, hyphens and quotes are every real font name.
    family: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 '"\-_,]{1,120}$/, "not a font family name"),
    scale: z.number().positive().max(4).default(1),
  }),
  logo: z.object({
    // An <img src>. http(s) or a data: image, never javascript: and never an arbitrary scheme.
    src: z
      .string()
      .trim()
      .refine((s) => s === "" || /^(https?:\/\/|data:image\/)/i.test(s), "logo src must be http(s) or a data:image URI"),
    /**
     * The company's name, set beside the mark on the cover. A logo alone is recognised by people
     * who already know you, which on a deck sent to a new client is nobody. The hand-built decks
     * all pair the two. Text, not markup: it is a name.
     */
    wordmark: z.string().trim().max(40).optional(),
    glow: CssColor.optional(),
  }),
});
export type Theme = z.infer<typeof Theme>;

export const Voice = z.object({
  name: z.string(),
  audience: z.string().optional(),
  tone: z.string().optional(),
  forbidden: z.array(z.string()).default([]),
  preferred: z.array(z.string()).default([]),
  locale: z
    .object({
      currency: z.string().default("USD"),
      dates: z.string().optional(),
    })
    .optional(),
  /** Free-form markdown guidance: the author's own "how I present" notes and examples. */
  instructions: z.string().optional(),
  notes: z.string().optional(),
});
export type Voice = z.infer<typeof Voice>;

/* ------------------------------------------------------------------ *
 * Escape hatches (docs/IR-SPEC.md section 8, D16)
 * ------------------------------------------------------------------ */

/** Raster asset (a screenshot or photo). The generator does not draw these. */
export const ImageContent = z.object({
  asset: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
});
export type ImageContent = z.infer<typeof ImageContent>;

/** Bespoke vector art (a hand-built chart or diagram). Raw SVG or a constrained fragment. */
export const FigureContent = z.object({
  svg: z.string().optional(),
  html: z.string().optional(),
  caption: z.string().optional(),
});
export type FigureContent = z.infer<typeof FigureContent>;

/* ------------------------------------------------------------------ *
 * Slide layouts (docs/IR-SPEC.md section 4)
 * ------------------------------------------------------------------ */

const Card = z.object({
  title: RichText,
  body: RichText,
  tag: z.string().optional(),
  /**
   * A single character or emoji, shown in a tinted box above the title. The vetted decks give
   * every role card one and they read materially faster for it. Constrained to one grapheme:
   * this is a mark, not a second heading, and the box it sits in is 38px.
   */
  icon: z.string().refine((s) => [...s].length <= 2, "icon must be a single character or emoji").optional(),
  bullets: z.array(RichText).optional(),
});

/** Fields common to every slide, regardless of layout. */
const SlideBase = z.object({
  id: z.string(),
  eyebrow: z.string().optional(),
  callout: CalloutBand.optional(),
  /** Presenter-only. Never sent to a client renderer. */
  notes: z.string().optional(),
});

export const Slide = z.discriminatedUnion("layout", [
  SlideBase.extend({
    layout: z.literal("bullets"),
    heading: RichText,
    lede: RichText.optional(),
    items: z.array(RichText),
  }),
  SlideBase.extend({
    layout: z.literal("cover"),
    heading: RichText,
    sub: RichText.optional(),
    preparedFor: z.string().optional(),
    date: z.string().optional(),
    contact: z.string().optional(),
  }),
  SlideBase.extend({
    layout: z.literal("close"),
    heading: RichText,
    sub: RichText.optional(),
    contact: z.string().optional(),
  }),
  SlideBase.extend({
    layout: z.literal("card-grid"),
    heading: RichText,
    // Five is allowed because five is what the vetted decks use for a cast of actors, and
    // without it a five-card slide fell to a three-and-two grid with a hole in it.
    columns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    cards: z.array(Card).min(1),
  })
    // Five cards in four columns leaves a hole in the last row, which reads as a mistake because
    // it is one. Say so here rather than letting the renderer draw it: the model set columns to 4
    // beside five cards and nothing objected.
    .refine((s) => !s.columns || s.cards.length % s.columns === 0 || s.cards.length < s.columns, {
      message: "cards do not fill the columns: give every row a full set, or leave columns out",
      path: ["columns"],
    }),
  SlideBase.extend({
    layout: z.literal("table"),
    heading: RichText,
    columns: z.array(RichText),
    rows: z.array(z.array(RichText)),
    totals: z.array(RichText).optional(),
    footnote: z.string().optional(),
  }),
  SlideBase.extend({
    layout: z.literal("steps"),
    heading: RichText.optional(),
    steps: z.array(
      z.object({
        label: z.string().optional(),
        title: RichText,
        body: RichText,
        actorTag: z.string().optional(),
      }),
    ),
  }),
  SlideBase.extend({
    layout: z.literal("statement"),
    heading: RichText,
    sub: RichText.optional(),
  }),
  SlideBase.extend({
    layout: z.literal("comparison"),
    heading: RichText,
    left: z.object({ title: RichText, body: RichText }),
    right: z.object({ title: RichText, body: RichText }),
  }),
  SlideBase.extend({
    layout: z.literal("callout"),
    body: RichText,
    tone: Tone.default("neutral"),
  }),
  SlideBase.extend({
    layout: z.literal("timeline"),
    heading: RichText,
    phases: z.array(
      z.object({
        label: z.string(),
        what: RichText,
        output: RichText.optional(),
        range: z.string().optional(),
      }),
    ),
  }),
  SlideBase.extend({
    layout: z.literal("swimlane"),
    // Optional, because a lane grid can carry a slide on its own, but present because the vetted
    // decks head theirs and without a slot the generated ones showed an eyebrow and then a table.
    heading: RichText.optional(),
    actors: z.array(z.object({ name: z.string(), dot: z.string().optional() })),
    stages: z.array(z.string()),
    cells: z.array(
      z.object({
        actor: z.string(),
        stage: z.string(),
        body: RichText.optional(),
        state: State.optional(),
      }),
    ),
    legend: z.array(z.string()).optional(),
  }),
  SlideBase.extend({
    layout: z.literal("flowchart"),
    heading: RichText.optional(),
    nodes: z.array(z.object({ id: z.string(), label: RichText })),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
    decisions: z.array(z.string()).optional(),
    legend: z.array(z.string()).optional(),
  }),
  SlideBase.extend({
    layout: z.literal("tool-visual"),
    heading: RichText.optional(),
    mocks: z.array(FigureContent),
  }),
  SlideBase.extend({
    layout: z.literal("chart"),
    heading: RichText,
    series: z.array(z.object({ label: z.string(), value: z.number() })),
    scale: z.number().optional(),
    tone: Tone.optional(),
  }),
  SlideBase.extend({
    layout: z.literal("stat-grid"),
    heading: RichText,
    stats: z.array(z.object({ value: z.string(), label: z.string(), state: State.optional() })),
  }),
  // Escape hatches usable as a whole slide.
  SlideBase.extend({ layout: z.literal("image"), asset: z.string(), alt: z.string(), caption: z.string().optional() }),
  SlideBase.extend({ layout: z.literal("figure"), svg: z.string().optional(), html: z.string().optional(), caption: z.string().optional() }),
]);
export type Slide = z.infer<typeof Slide>;

/* ------------------------------------------------------------------ *
 * Document blocks (docs/IR-SPEC.md section 5)
 * ------------------------------------------------------------------ */

const BlockBase = z.object({ id: z.string() });

export const Block = z.discriminatedUnion("type", [
  BlockBase.extend({
    type: z.literal("prose-section"),
    heading: RichText.optional(),
    body: ProseContent,
  }),
  BlockBase.extend({
    type: z.literal("long-table"),
    heading: RichText.optional(),
    columns: z.array(z.object({ label: RichText, sub: z.string().optional() })),
    rows: z.array(z.array(RichText)),
    totals: z.array(RichText).optional(),
    footnote: z.string().optional(),
  }),
  BlockBase.extend({
    type: z.literal("code-block"),
    language: z.string().optional(),
    caption: z.string().optional(),
    code: z.string(),
    expectedOutput: z.string().optional(),
  }),
  BlockBase.extend({
    type: z.literal("toc"),
    heading: RichText.optional(),
    entries: z.array(z.object({ label: RichText, note: z.string().optional() })),
  }),
  BlockBase.extend({
    type: z.literal("ranked-list"),
    heading: RichText.optional(),
    items: z.array(z.object({ title: RichText, body: RichText.optional() })),
  }),
  BlockBase.extend({
    type: z.literal("two-panel"),
    heading: RichText.optional(),
    left: z.object({ title: RichText, body: ProseContent }),
    right: z.object({ title: RichText, body: ProseContent }),
  }),
  BlockBase.extend({
    type: z.literal("known-gaps"),
    heading: RichText.optional(),
    gaps: z.array(z.object({ item: RichText, note: RichText.optional(), state: State.optional() })),
  }),
  BlockBase.extend({
    type: z.literal("source-note"),
    label: z.string().optional(),
    body: RichText,
    href: z.string().optional(),
  }),
  BlockBase.extend({ type: z.literal("image"), asset: z.string(), alt: z.string(), caption: z.string().optional() }),
  BlockBase.extend({ type: z.literal("figure"), svg: z.string().optional(), html: z.string().optional(), caption: z.string().optional() }),
]);
export type Block = z.infer<typeof Block>;

/* ------------------------------------------------------------------ *
 * Artifacts (docs/IR-SPEC.md sections 2, 4, 5, 6, 7)
 * ------------------------------------------------------------------ */

const ArtifactMeta = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  workspace: z.string(),
});

/** A slide deck. */
export const Deck = ArtifactMeta.extend({
  kind: z.literal("slide-deck"),
  part: z.object({ n: z.number().int(), of: z.number().int() }).optional(),
  next: z.object({ label: z.string(), ref: z.string() }).optional(),
  slides: z.array(Slide),
});
export type Deck = z.infer<typeof Deck>;

/** A long-form scrolling document. */
export const DocumentArtifact = ArtifactMeta.extend({
  kind: z.literal("document"),
  blocks: z.array(Block),
  toc: z.object({ generated: z.boolean() }).optional(),
});
export type DocumentArtifact = z.infer<typeof DocumentArtifact>;

/** One editable commercials line. */
const PricingLine = z.object({
  description: RichText,
  sub: RichText.optional(),
  listPrice: z.number().optional(),
  offerPrice: z.number(),
  include: z.boolean().default(true),
  /** Subtotal group this line belongs to, for example "Core" or "Optional". Lines that
   *  share a group value get a subtotal row; lines with no group are grouped together. */
  group: z.string().optional(),
});

/** The interactive pricing tool. */
export const Tool = ArtifactMeta.extend({
  kind: z.literal("tool"),
  tool: z.literal("pricing"),
  lines: z.array(PricingLine),
  locale: z.object({ currency: z.string().default("INR") }),
  notes: z.array(RichText).default([]),
  presenterMode: z.boolean().default(false),
});
export type Tool = z.infer<typeof Tool>;

/** The hub is generated from the pack; this is its stored shell. */
export const Hub = ArtifactMeta.extend({ kind: z.literal("hub") });
export type Hub = z.infer<typeof Hub>;

export const Artifact = z.discriminatedUnion("kind", [Deck, DocumentArtifact, Tool, Hub]);
export type Artifact = z.infer<typeof Artifact>;

/* ------------------------------------------------------------------ *
 * Pack (docs/IR-SPEC.md section 1)
 * ------------------------------------------------------------------ */

export const ArtifactRef = z.object({
  id: z.string(),
  kind: z.enum(["slide-deck", "document", "hub", "tool"]),
  slug: z.string(),
  title: z.string(),
  blurb: z.string().optional(),
  audience: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRef>;

export const Pack = z.object({
  id: z.string(),
  workspace: z.string(),
  title: z.string(),
  artifacts: z.array(ArtifactRef),
  hub: z.object({ generated: z.boolean() }).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Pack = z.infer<typeof Pack>;

/* ------------------------------------------------------------------ *
 * Versioning, sharing, watermark (docs/IR-SPEC.md section 9; D10, D13, D14)
 * ------------------------------------------------------------------ */

export const DeckVersion = z.object({
  id: z.string(),
  deckId: z.string(),
  version: z.number().int(),
  parentVersion: z.number().int().nullable(),
  /** The full artifact-IR snapshot. Source of truth. */
  ir: z.unknown(),
  author: z.string(),
  /** ISO 8601, surfaced in Indian Standard Time. */
  createdAt: z.string(),
  source: z.enum(["generated", "hand-edited"]),
  changelog: z.string().optional(),
});
export type DeckVersion = z.infer<typeof DeckVersion>;

export const Share = z.object({
  shareId: z.string(),
  deckId: z.string(),
  /** The pinned version the recipient sees. Never floats to latest. */
  versionId: z.string(),
  recipient: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type Share = z.infer<typeof Share>;

export const WatermarkConfig = z.object({
  fields: z.array(z.string()),
  template: z.string(),
  label: z.string(),
  opacity: z.number(),
  tiling: z.record(z.string(), z.unknown()),
});
export type WatermarkConfig = z.infer<typeof WatermarkConfig>;
