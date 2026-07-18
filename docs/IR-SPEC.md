# DeckTrail deck IR specification

This specifies the intermediate representation (IR): the JSON (JavaScript Object Notation)
documents that are the source of truth for every artifact DeckTrail serves. The schemas in
`packages/ir` are the authority; where this document and the schema disagree, the schema is
right.

Governing decisions: `DECISIONS.md` D6 (IR is the core abstraction), D7 (generator picks
layouts, refined by D16), D10 (versioning), D13 (URLs), D14 (watermark), D16 (three-mode
pack model plus escape hatches), D17 (Wave 1 Pack MVP scope).

---

## 0. Principles

1. A **pack** (a client engagement) contains one or more **artifacts**. An artifact is a
   slide deck, a scrolling document, a hub, or an interactive tool. See D16.
2. Content, brand, and register are separate documents: content per artifact, plus a
   `theme.json` (brand) and a `voice.json` (register). Theme is per artifact, not global.
3. The generator picks a layout or block and fills named slots. It never emits CSS
   (cascading style sheets) and never invents structure. See D7.
4. The IR additionally carries two typed **escape hatches**, `image` and `figure`, for
   imported and captured content the generator does not author (screenshots, bespoke
   charts and diagrams). See D16 and section 8.
5. Slots are rich text, not plain strings, where the corpus needs it (section 3.1).
6. No value that belongs to a brand, a viewer, or an environment is baked into content.
   Theme, watermark, locale, and host are configuration.
7. The renderers consume content plus theme. `voice.json` is used at generation time in
   the studio, not at render time.

---

## 1. pack.json (the engagement)

A pack ties a client engagement's artifacts together and is the unit a hub indexes and a
share link is scoped within.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Pack identifier, unique within a workspace. |
| `workspace` | string | yes | Tenant. |
| `title` | string | yes | Engagement title. |
| `artifacts` | `ArtifactRef[]` | yes | Ordered artifacts in the pack. |
| `hub` | `{generated: true}` or a hub artifact id | no | How the index is produced. |
| `meta` | object | no | Non-rendered tooling notes. |

`ArtifactRef`: `{ id, kind, slug, title, blurb?, audience? }` where `kind` is
`slide-deck` | `document` | `hub` | `tool`. The `audience` tag (for example internal or
external, driver or operator) and `blurb` feed the hub.

---

## 2. Artifact kinds

| Kind | Content document | Shape |
|---|---|---|
| `slide-deck` | `deck.json` (section 4) | Full-viewport slides, one layout each. |
| `document` | `document.json` (section 5) | Long-form, vertically scrolling blocks. |
| `hub` | generated from `pack.json` | An index of the pack's artifacts. |
| `tool` | `tool.json` (section 7) | An interactive view, for example pricing. |

Every artifact carries: `id`, `kind`, `slug`, `title`, a `theme` reference, and (for
generated artifacts) a `voice` reference.

---

## 3. Shared building blocks

### 3.1 Rich text

A constrained inline vocabulary usable in heading, lede, body, and table-cell slots:
plain runs plus `emphasis`, `strong`, `code`, `link {href}`, and `highlight` (the
gradient emphasis span the brand uses in headings). **Authoring shorthand:** a plain string
is accepted anywhere rich text is expected, and is read as a single text run, so
`heading: "Scope"` is equivalent to `heading: [{ "type": "text", "text": "Scope" }]`. Reach
for the run array only when a slot needs inline emphasis, code, or a link. Block-level rich
content (used in
document `prose-section` bodies and rich table cells) adds `paragraph`, `list`
(ordered/unordered, nestable), and `blockquote {attribution?}`. No raw HTML in rich text;
raw fragments go through the `figure` escape hatch (section 8).

### 3.2 theme.json (brand, per artifact)

| Field | Type | Notes |
|---|---|---|
| `name` | string | Theme name. |
| `colors` | object | Named tokens: `bg`, `surfaceLow`, `surfaceHigh`, `accent`, `accentDim`, `accent2`, `accent2Dim`, `text`, `heading`, `muted`, plus semantic state tokens `good`, `warn`, `bad`. |
| `typography` | `{family, scale}` | Font family by name, and a multiplier on the type scale. The family is embedded at render time from the copy fetched by `pnpm fetch-fonts`; without one, decks use the reader's system fonts. |
| `logo` | `{src, wordmark?, glow?}` | `src` is an `http(s)` or `data:image` URI; prefer `data:` so a deck stays self-contained. `wordmark` is the company name, set beside the mark on the cover. `glow` tints the drop shadow. |

These are the whole theme. Everything else about how an artifact looks is fixed in the renderer
and is identical under every theme.

Theme is referenced per artifact, so one pack can mix themes.

### 3.3 voice.json (register, generation-time)

Pluggable presets with a neutral default; the OrbitQube house style is one preset, never
the silent default (D12). Fields: `name`, `audience`, `tone`, `forbidden[]`,
`preferred[]`, `locale {currency, dates?}`, `instructions` (free-form markdown: the author's
own "how I present" guidance and examples), `notes`.

Wired into generation: `studio` composes the prompt as a fixed IR-shape reference plus this
voice block. The CLI reads `voice.json` and folds in a `voice.md` (or `--voice` / `--voice-md`);
with no voice file it uses the neutral default. So each author generates in their own register,
not the maintainer's. See `voice.example.json`.

---

## 4. Slide mode: deck.json

| Field | Type | Required | Notes |
|---|---|---|---|
| `id`, `title`, `slug`, `workspace` | string | yes | As in section 2. |
| `part` | `{n, of}` | no | Position in a linked set. |
| `next` | `{label, ref}` | no | Cross-link to the next artifact. |
| `slides` | `Slide[]` | yes | Ordered slides. |

**Slide:** `{ id, layout, slots, notes? }`. `id` is stable and addressable (enables
per-slide streaming and analytics). `notes` is presenter-only and never sent to a client
renderer. Cross-cutting optional slots available to most layouts: `eyebrow`, a `callout`
band appended after the main content, and (for `cover`/`close`) brand logo, prepared-for,
date, and contact. Full slot detail per layout is in the catalog below.

### Slide layout catalog

Wave 1 (D17), ordered by frequency in the real decks:

| Layout | Core slots |
|---|---|
| `bullets` | eyebrow?, heading, lede?, items[] (rich list). The most common slide. |
| `cover` | eyebrow?, heading, sub?, logo, preparedFor?, date?, contact? |
| `close` | heading, sub?, logo, contact/cta? |
| `card-grid` | eyebrow?, heading, columns? (2-5), cards[] {title, body, icon?, tag?, bullets?} |
| `table` | eyebrow?, heading, columns[], rows[][], totals?, footnote? |
| `steps` | eyebrow?, heading?, steps[] {label?, title, body, actorTag?} |
| `statement` | eyebrow?, heading, sub? |
| `comparison` | eyebrow?, heading, left, right |
| `callout` | body, tone (neutral/red/green/note) |
| `timeline` | eyebrow?, heading, phases[] {label, what, output?, range?} (table variant allowed) |
| `swimlane` | heading?, actors[] {name, dot?}, stages[], cells[] {actor, stage, body?, state?}, legend? |
| `flowchart` | heading?, nodes[] {id, label}, edges[] {from, to, label?}, decisions? (node ids), legend? |
| `tool-visual` | mocks[] (hand-authored figures); single or grid. Not offered to the generator: the sanitiser strips styling from generated markup. |
| `chart` | eyebrow?, heading, series[] {label, value}, scale?, tone? |
| `stat-grid` | eyebrow?, heading, stats[] {value, label, state?} |

Deferred to fast-follows (D17): `ranked-list`, `horizon-roadmap` (now/next/later),
`two-panel`, `gallery`, `quote`.

---

## 5. Document mode: document.json

| Field | Type | Required | Notes |
|---|---|---|---|
| `id`, `title`, `slug`, `workspace` | string | yes | |
| `blocks` | `Block[]` | yes | Ordered content blocks; the document scrolls. |
| `toc` | `{generated: true}` | no | An in-document index. |

A **Block** is `{ id, type, ...slots }`. Blocks are addressable for per-section analytics.

### Document block catalog

Wave 1 (D17):

| Block | Core slots |
|---|---|
| `prose-section` | heading?, body (block-level rich text: paragraphs, lists, blockquote, inline code) |
| `long-table` | heading?, columns[] {sub?}, rows[] (rich cells, links), totals?, statusCells?, footnote? |
| `code-block` | language?, caption?, code, expectedOutput? |
| `toc` | heading?, entries[] {label, note?} (table of contents) |
| `ranked-list` | heading?, items[] {title, body?} (auto-numbered) |
| `two-panel` | heading?, left {title, body}, right {title, body} (side-by-side prose) |
| `known-gaps` | heading?, gaps[] {item, note?, state?} (honest-limitations list) |
| `source-note` | label?, body, href? (provenance/citation) |
| `image` | asset, alt, caption? (escape hatch, section 8) |

Deferred to fast-follows (D17): `status-matrix`, `procedure`, `scenario`/`test-case`,
`adr`, `walkthrough-step`, `commercial-arithmetic`, `audience-box`, `gallery`.

---

## 6. Hub

Generated from `pack.json`. Renders a titled grid of link tiles, one per artifact
(`ordinal`, `title`, `blurb`, `audience` tag, destination), plus a pack-level
confidentiality footer. No hand-authored content; it is a projection of the pack.

---

## 7. Interactive tool: tool.json (pricing)

The live-editable commercials tool, validated as a genuine stateful artifact, not a
static table. Fields: `lines[] {description, sub?, listPrice?, offerPrice, include,
group?}`, `locale {currency}` (Indian Rupee, en-IN grouping), a `notes[]` terms list, and
a `presenterMode` visibility flag. Each line carries an optional `group` tag (for example
Core or Optional); when two or more groups are present the renderer shows a subtotal per
group above the computed grand total. Prices are never baked into a slide.

The renderer has two states. Locked (the default, and always used when the portal serves
the tool) is a static client view with no editing control in the DOM at all: the recipient
sees the agreed figures, watermarked, and cannot change them. Presenter (revealed with the
E key on a local render, gated by `presenterMode`) turns the sheet into a live grid where
the sender can edit an amount, toggle a line in or out, add a line, remove a line, apply a
percentage adjustment, or reset. The total recomputes as they go, so the line list is never
fixed.

---

## 8. Escape hatches (D16)

For imported and captured content the generator does not author. The generator stays
constrained to layouts and slots; these hold what slot-fill cannot.

| Hatch | Slots | Use |
|---|---|---|
| `image` | `asset` (reference), `alt`, `caption?` | Raster screenshots and photos. |
| `figure` | `svg` (raw inline SVG) or `html` (constrained fragment), `caption?` | Bespoke vector charts and architecture diagrams. |

Both are available as a slide layout and as a document block. `figure` is an import and
migration path, not a generation path.

`figure` markup is sanitised against an allowlist before rendering (`renderers/sanitize.ts`):
a fixed set of SVG drawing elements and presentation attributes survive, and everything else
is discarded. No `script`, no `foreignObject`, no event handlers, no `style`, no `href`. If a
legitimate diagram loses an element, widen the allowlist deliberately rather than working
around it.

> **`figure` carries SVG, not styled HTML, and the difference decides whether it is any use to
> you.** The allowlist strips `<style>` blocks and every `style=` attribute. `class` survives
> but there is no channel to ship the CSS it refers to, so HTML that draws a diagram out of
> classed `<div>`s arrives as a pile of unstyled boxes. That is not a corner case: the first
> real corpus we ported drew most of its diagrams exactly that way, and `figure` could carry
> none of them.
>
> So: a self-contained SVG imports cleanly. A CSS-styled HTML diagram does not. Where a diagram
> fits a real layout, rebuild it as one (`flowchart`, `swimlane`, `card-grid`); where it does
> not, screenshot it and use `image`. `figure` is a narrow hatch for drawings, not a general
> import path for markup.

---

## 9. Versioning, sharing, watermark

- **Versioning and audit (D10):** immutable, append-only `deck_version` rows carrying the
  full artifact-IR snapshot, `parentVersion`, author, created-at (Indian Standard Time),
  source (`generated`/`hand-edited`), and a changelog note. Versioning unit is the whole
  artifact. Change history is a diff computed on read. Every viewer event is stamped with
  the `version_id` actually seen.
- **Sharing and URLs (D13):** opaque recipient link `/d/<shareId>` pinned to the version
  sent; readable owner-console paths `/<workspace>/<deck-slug>[/v<n>]`; configurable base
  host; legacy host retained for existing URLs.
- **Watermark (D14):** per-viewer, self-hoster configurable (fields, format, label,
  opacity, tiling). Injected by the portal renderer at serve time.
- **Portal/pack tokens:** confidentiality footer, `noindex`/`noai`/`noimageai`/print-block
  flags, and locale are configuration, not hardcoded.

---

## 10. Renderer contract

| Renderer | Input | Output |
|---|---|---|
| `standalone` | one artifact's content + `theme.json` | One self-contained HTML file. For handing over a file. |
| `portal` | content + `theme.json` + viewer context (recipient, version, watermark config) | Slide-per-endpoint or scrolling-document HTML, per-viewer watermark applied at request time, each unit behind a signed token. For gated, tracked delivery. |

Both consume the same IR. The hub and tool artifacts render through the portal.

---

## 11. Wave 1 scope (D17)

Build enough to author and migrate one complete client proposal pack: the pack model and
hub, slide mode with the fifteen frequency-ranked layouts (section 4), a minimal document
mode (`prose-section`, `long-table`, `code-block`, `image`), the pricing tool, and both
escape hatches. The deferred layouts and blocks (sections 4 and 5) are fast-follows.

Validation continues against the live corpus: as each layout and block is built, it is
checked against the real artifacts it must express, and the slot
schemas are filled from the gap lists there.
