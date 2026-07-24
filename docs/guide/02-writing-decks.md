# Writing a deck

A deck is a JSON document. You can have DeckTrail write it from your notes, or write it by hand.
Either way the result is the same intermediate representation (IR), validated against one schema,
then rendered or published. This page covers both paths and the full layout library.

The complete field-by-field shape is in [the IR spec](../IR-SPEC.md); this is the working guide.

---

## Two ways to author

### Generate from notes

DeckTrail turns prose into a finished deck in your voice. It runs on your machine whichever model
writes it: the portal never sees a model key, and your content never leaves your control.

```sh
decktrail generate notes.md --client acme --out deck.json
```

- `notes.md` is any prose: a brief, meeting notes, an existing document's text.
- `--client acme` sets the workspace (the client this deck is for). See [workspaces](#workspaces).
- The voice comes from, in order: `--voice voice.json`, a `voice.json` in the directory you run
  the command from, the voice saved in your console, that voice's local cache when the console
  cannot be reached, and failing all of those a neutral default. See
  [Your brand and your voice](03-brand-and-voice.md).

If generation produces an invalid field, it repairs itself once or twice automatically before
giving up with the exact error.

#### Choosing the model

The default is **your own Claude Code login**: a Claude Pro or Max subscription, installed and
logged in with `claude login`, costing nothing beyond the subscription. If it is not logged in,
generation fails with a clear message rather than stalling.

You do not need a Claude subscription. With [OpenCode](https://opencode.ai) installed, DeckTrail
can drive whatever model you have configured there, including one running on your own hardware
and OpenCode's own free tier:

```sh
decktrail generate notes.md --client acme \
  --provider opencode --model opencode/nemotron-3-ultra-free
```

Set it once instead of typing it every time, in `.decktrail/config.json`:

```json
{ "generate": { "provider": "opencode", "model": "opencode/nemotron-3-ultra-free" } }
```

DeckTrail holds no model credential in either case. Whatever a backend needs to authenticate is
that backend's own configuration. `decktrail config show` prints what resolved and from where.

A smaller model writes a good deck and gets the schema wrong more often. Give it more attempts
with `--repair-attempts 4` rather than abandoning it, and expect a visibly different deck from
the same notes: the tool prints which model ran, so you can tell them apart later.

#### Starting from a document you already have

The content does not have to be prose you wrote for the purpose. Point `generate` at a PDF, a
PowerPoint deck, a Word document, or a photograph of a page, and the text is pulled out first:

```sh
decktrail generate last-years-proposal.pptx --client acme --out deck.json
```

This **re-authors, it does not convert**. The words come across; the layout, the master slides, and
anything carried only by a picture do not. That is the deal, and it is deliberate: the point is a
deck rebuilt in your brand and your layouts, not a copy of the old one.

Check what was found before you spend a model call on it:

```sh
decktrail extract last-years-proposal.pptx --out notes.md
```

For a normal PDF or deck the extraction is exact, because the text is already text. A **scan or a
photograph has no text in it**, so the words have to be read off the picture, and that reading is
never perfect. In testing, a rendered line reading "Pilot fee is 18 lakh rupees" came back as
"Pilotfee is I 8 lakh rupees". The model will faithfully carry a mistake like that into a slide, so
read the extraction first and fix it. Reading pictures happens only when a document carries no text
of its own; `--ocr never` turns it off entirely, and `--ocr force` uses it even over a text layer,
for an export whose own text is worse than the page it sits on.

Two things worth knowing about reading pictures: the engine downloads its language data the first
time it runs, unless `DT_OCR_LANG_PATH` points at a local copy, and a scanned **PDF** additionally
needs the optional `@napi-rs/canvas` package to turn its pages into images. Your document is never
uploaded anywhere in either case.

#### Generating with no portal reachable

Generation does not need the portal. Only your voice lives there, so pull a copy before you lose
the connection:

```sh
decktrail voice pull
```

After that, generation offline uses the cached register and tells you the date it was cached. If
you never pulled one, it falls back to the neutral default and says so. It does not fail: by the
time the portal turns out to be unreachable you have already chosen your notes and your client,
and a plainer voice is a better outcome than no deck.

### Write it by hand

Every deck is plain JSON, so you can write or edit one directly. The smallest deck that works:

```json
{
  "id": "d1",
  "title": "A proposal for Acme",
  "slug": "acme-proposal",
  "workspace": "acme",
  "kind": "slide-deck",
  "slides": [
    { "id": "s1", "layout": "cover", "heading": "A proposal", "sub": "For Acme" },
    { "id": "s2", "layout": "bullets", "heading": "What we would build",
      "items": ["Intake", "Scheduling", "Reporting"] }
  ]
}
```

Hand-editing a generated deck is the normal workflow: generate the draft, then fix a headline or
reorder a slide in the JSON.

---

## Always validate, then look

```sh
decktrail validate deck.json                    # valid: slide-deck
decktrail render deck.json --out preview.html   # open preview.html and read it
```

`validate` tells you the kind or names the exact field that is wrong. `render` produces a
self-contained HTML file (a standalone deck, no watermark, no gating) so you can read the real
output before anyone else does. Add `--theme theme.json` to preview in your brand, or `--public`
to drop the "Private and Confidential" label.

---

## The layout library

The generator never writes CSS and never invents structure. It chooses a layout and fills its
named slots, so every deck stays reskinnable and cannot render broken (decision D7). These are
the slide layouts:

| Layout | For |
|---|---|
| `cover` | The opening slide: a heading, a subtitle, context. |
| `bullets` | Heading, an optional lede, a list. The most common slide. |
| `statement` | One large sentence that should land on its own. |
| `card-grid` | Two to five cards, each an icon, title, and body. |
| `stat-grid` | A row of figures, each a value and a label. |
| `comparison` | Two or three columns weighed against each other. |
| `table` | Rows and columns, with an optional totals row. |
| `steps` | An ordered sequence, each step with an actor tag. |
| `timeline` | Phases over time, with an output per phase. |
| `swimlane` | Parallel lanes of activity, a process across actors. |
| `flowchart` | Nodes and edges with decision diamonds, drawn with computed geometry. |
| `callout` | A highlighted band for a single important note. |
| `chart` | A simple bar or line chart from numeric values. |
| `close` | The closing slide: a call to action and contact. |

`tool-visual` exists but is withheld from the generator; it is used internally by the pricing
tool. Text slots (headings, ledes, bodies, table cells) carry a small rich-text vocabulary:
emphasis, strong, code, link, and a highlight span that paints across the brand accent.

### When a layout is not enough: the escape hatches

For content the generator does not author, the IR carries two typed blocks (decision D16):

- `image`: a raster asset with alt text and a caption, for screenshots and photos.
- `figure`: inline SVG (or a constrained HTML fragment) for a bespoke chart or diagram.

`figure` is an allowlisted hatch, not a way to smuggle arbitrary HTML: the sanitizer strips
`<style>`, `style=`, and scripts. If a figure depends on external CSS, it will render unstyled.
Use SVG for anything visual.

---

## More than slides: packs, documents, hubs, tools

A client engagement is often more than one deck. The IR models this as a **pack**: a workspace
that holds one or more **artifacts**:

- a **slide deck** (what `decktrail generate` produces),
- a scrolling **document** (long-form prose sections),
- an interactive **pricing tool** (the commercial proposal, a live-editable table),
- a **hub**: the grouped, card-based index of the engagement.

**Generation produces slide decks only.** Documents, pricing tools, and the pack manifest are
hand-authored JSON. See [the IR spec](../IR-SPEC.md) for their shapes, and these working
references in `examples/`: `acme.deck.json`, `acme.document.json`, `acme.tool.json`, and
`acme.pack.json`. The hub is not authored at all: it is a deterministic index of whatever the
pack lists.

Documents and tools publish, gate, watermark, and track exactly like a deck. Sharing the pack to
a recipient turns it into their gated hub: see
[Send a whole engagement as one link](04-sending-and-tracking.md#send-a-whole-engagement-as-one-link).

---

## Workspaces

`workspace` is the client the deck is for, not you (decision D23). It is how the console groups
decks, invites, and analytics once you have more than a handful. When you generate, `--client`
sets it; when you write by hand, set it yourself. It is an organising label only, never an access
control: who may open a deck is decided by the share recipient, not the workspace.

## Next

- [Your brand and your voice](03-brand-and-voice.md) to make it look and read like you.
- [Sending and tracking](04-sending-and-tracking.md) to publish it and see who reads it.
- [The CLI reference](../reference/cli.md) for every command and flag.

---

<!-- guide-nav -->
**The guide:** [← Quickstart](01-quickstart.md) · [All docs](../README.md) · [Your brand and your voice →](03-brand-and-voice.md)
