# Writing a deck

A deck is a JSON document. You can have DeckTrail write it from your notes, or write it by hand.
Either way the result is the same intermediate representation (IR), validated against one schema,
then rendered or published. This page covers both paths and the full layout library.

The complete field-by-field shape is in [the IR spec](../IR-SPEC.md); this is the working guide.

---

## Two ways to author

### Generate from notes (with Claude Code)

If you have a Claude Pro or Max subscription and Claude Code installed and logged in
(`claude login`), DeckTrail turns prose into a finished deck in your voice. It runs on your
machine, on your subscription; the portal never sees a model key and your content never leaves
your control.

```sh
decktrail generate notes.md --client acme --out deck.json
```

- `notes.md` is any prose: a brief, meeting notes, an existing document's text.
- `--client acme` sets the workspace (the client this deck is for). See [workspaces](#workspaces).
- The voice comes from, in order: `--voice voice.json`, a `voice.json` beside the content, or
  the voice saved in your console (pass `--portal <url> --token <token>` to read it). With none
  of those, a neutral default. See [Your brand and your voice](03-brand-and-voice.md).

If generation produces an invalid field, it repairs itself once or twice automatically before
giving up with the exact error. If Claude Code is not logged in, it fails with a clear message
rather than stalling.

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
that holds one or more **artifacts**, where an artifact is a slide deck, a scrolling **document**
(long-form prose sections), a **hub** (an auto-generated index tying the pack together), or an
interactive **pricing tool** (a live-editable commercials table). See [the IR spec](../IR-SPEC.md)
for the document blocks and the tool shape. Each publishes and shares the same way as a deck.

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
