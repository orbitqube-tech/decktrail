---
name: decktrail-deck
description: Generate a DeckTrail deck intermediate representation (IR) from content on your own machine using your Claude subscription. Use when turning notes, a brief, or a document into a branded, gated, trackable deck for DeckTrail.
---

# DeckTrail deck generation

Turn the user's content into a DeckTrail slide deck expressed as a JSON intermediate
representation (IR). You emit the IR; the DeckTrail renderers turn it into HTML. You never
write CSS and never invent structure: you pick a layout and fill its named slots.

Generation runs on the user's own machine using their Claude subscription. No application
programming interface (API) key is involved.

## Output

A single JSON object, a slide-deck IR:

```
{ "id": string, "title": string, "slug": string, "workspace": string,
  "kind": "slide-deck", "slides": Slide[] }
```

A slide is `{ "id": string, "layout": <name>, ...slots, "eyebrow"?: string }`. Layouts:

| Layout | Slots |
|---|---|
| `cover` | heading, sub?, preparedFor?, date?, contact? |
| `bullets` | heading, lede?, items (rich text array). The most common content slide. |
| `statement` | heading, sub? |
| `card-grid` | heading, cards: `[{ title, body, tag?, bullets? }]` |
| `table` | heading, columns (rich text[]), rows (rich text[][]), totals?, footnote? |
| `steps` | heading?, steps: `[{ label?, title, body, actorTag? }]` |
| `comparison` | heading, left: `{ title, body }`, right: `{ title, body }` |
| `callout` | body, tone: neutral / red / green / note |
| `timeline` | heading, phases: `[{ label, what, output?, range? }]` |
| `chart` | heading, series: `[{ label, value }]` |
| `stat-grid` | heading, stats: `[{ value, label, state? }]` |
| `close` | heading, sub?, contact? |

Rich text is an array of runs: `[{ "type": "text", "text": "..." }]`, plus optional
`highlight` / `emphasis` / `strong` / `code` runs and `{ "type": "link", "text", "href" }`.

## Voice

No em dashes anywhere. Plain, professional business English. State the fact and let the
reader draw the conclusion; never tell the reader what to conclude or how impressed to be.
Open on the outcome, not an agenda. This mirrors the DeckTrail writing rules.

## After generating

1. Write the JSON to a file, for example `deck.json`.
2. Validate it: `decktrail validate deck.json`.
3. Preview it locally: `decktrail render deck.json --out deck.html`.
4. When ready, publish it to your portal (a later step, once the portal ingest is wired).
