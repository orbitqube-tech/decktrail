# Examples

DeckTrail, explaining itself, in itself.

```sh
pnpm demo          # renders decktrail.deck.json and tells you where it landed
```

Open the file it names. Arrow keys or space to move, `o` for the slide menu, `f` for fullscreen.

## decktrail.deck.json

The deck we would send you about DeckTrail, written as the intermediate representation (IR) that
every deck is. It is three things at once, deliberately:

- **The pitch.** What DeckTrail does, what it costs you, and a slide listing what it cannot do,
  which is on the table above the fold rather than in a footnote.
- **The demonstration.** Ten layouts, including the two worth seeing: the flowchart on slide 6
  draws how a link actually opens, and the swimlane on slide 7 shows where the work happens. Both
  are computed from the JSON below them, not drawn by hand.
- **The smoke test.** If the renderer breaks, this breaks, and we find out before you do.

Read it as JSON first, then render it. The point of the IR is that those are the same document:
your content stays structured, and how it looks is a theme applied at the end.

## Try it against your own brand

```sh
decktrail brand https://your-site.example --out theme.json
decktrail render examples/decktrail.deck.json --theme theme.json --out yours.html
```

The same deck, your colours, your typeface, your logo. No slide changed. That is the whole
argument for keeping content and brand apart, and it takes about a minute to check.

Brand extraction reads your stylesheet and will not get everything: a colour named "cyan" tells a
tool the hue, not the job. Finish it by hand, or in the console.

## Writing your own

The IR is plain JSON and the generator is optional:

```sh
decktrail validate my-deck.json                    # check it against the schema
decktrail generate notes.md --out my-deck.json     # or write it from your notes
```

`docs/IR-SPEC.md` is the full model. Every layout, every slot, and what each one accepts.
