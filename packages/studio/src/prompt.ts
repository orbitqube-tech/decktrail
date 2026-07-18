import type { Voice } from "@decktrail/ir";

/**
 * The neutral default voice, used when the author has configured none. Deliberately generic
 * so DeckTrail suits anyone out of the box; a specific style (including "no em dashes",
 * a particular locale, and so on) is the author's own Voice config, not baked in here.
 */
export const DEFAULT_VOICE_BLOCK =
  "Voice: clear, professional business English. Lead with the outcome, not an agenda. " +
  "State the fact and let the reader draw the conclusion. Keep sentences plain and specific.";

/** Render an author's Voice into the prompt's voice block. */
export function renderVoice(voice: Voice): string {
  const parts: string[] = [`Voice: ${voice.tone ?? "clear, professional business English"}.`];
  if (voice.audience) parts.push(`Audience: ${voice.audience}.`);
  if (voice.preferred.length > 0) parts.push(`Prefer: ${voice.preferred.join("; ")}.`);
  if (voice.forbidden.length > 0) parts.push(`Never use: ${voice.forbidden.join("; ")}.`);
  if (voice.locale) {
    const loc = [`currency ${voice.locale.currency}`, voice.locale.dates ? `dates in ${voice.locale.dates}` : ""].filter(Boolean);
    parts.push(`Locale: ${loc.join(", ")}.`);
  }
  if (voice.instructions) parts.push(voice.instructions.trim());
  if (voice.notes) parts.push(voice.notes.trim());
  return parts.join("\n");
}

/**
 * Build the generation prompt handed to Claude Code (subscription-only, D9). The IR shape is
 * fixed (it is the schema); the voice block is configurable per author, falling back to the
 * neutral default.
 */
export function buildGeneratePrompt(content: string, voice?: Voice): string {
  const voiceBlock = voice ? renderVoice(voice) : DEFAULT_VOICE_BLOCK;
  return `Generate a DeckTrail slide deck. Output ONLY a single JSON object that is a valid
DeckTrail slide-deck intermediate representation. No prose, no markdown code fences.

Top-level shape:
{ "id": string, "title": string, "slug": string, "workspace": string, "kind": "slide-deck", "slides": Slide[] }

"workspace" is the CLIENT this deck is for, lowercase and hyphenated, for example
"acme-logistics". It is who the deck is going TO, never who is sending it: it groups a
sender's decks by client. If the content does not say who the client is, use "default".

Every slide may also carry: "eyebrow" (a short kicker above the heading), "callout"
({ body, tone }) appended after the main content, and "notes" (presenter-only prose, never
shown to the recipient; put anything you would say aloud here rather than on the slide).

Two closed sets are referred to below. A value outside them is rejected, so never invent one:
- TONE is exactly one of: "neutral", "red", "green", "note".
- STATE is exactly one of: "good", "warn", "bad". Map any other reading onto the nearest of the
  three (for example "at risk" and "blocked" are both "bad", "on track" is "good"), or omit it.

Every slot marked ? is optional and is better omitted than filled with a guess. Every slot not
marked ? is required. Do not invent slots that are not listed: an unknown slot is rejected.

A slide is { "id": string, "layout": <name>, ...slots }. Layouts and slots:
- cover: heading (rich text), sub?, preparedFor?, date?, contact?
- bullets: heading, lede?, items (array of rich text). The most common content slide.
- statement: heading, sub?
- card-grid: heading, columns? (2|3|4|5), cards: [{ title, body, icon?, tag?, bullets? }]. Both
  title and body are REQUIRED on every card; put the detail in body, not only in bullets. "icon"
  is ONE emoji standing for the card ("👤" for a person, "⚙️" for a system): give every card one
  when the cards are roles, actors or tools, and none at all otherwise. Set "columns" to the
  number of cards when that is 5 or fewer, so they sit in one row rather than leaving a hole.
- table: heading, columns (rich text[]), rows (rich text[][]), totals? (rich text[]), footnote?
- comparison: heading, left: { title, body }, right: { title, body }
- callout: body, tone: TONE
- timeline: heading, phases: [{ label, what, output?, range? }]
- chart: heading, series: [{ label, value }] where value is a NUMBER (never a string, never a
  string with a unit), scale? (a positive number, at most 4), tone? (TONE)
- stat-grid: heading, stats: [{ value, label, state? (STATE) }] where value is a STRING, so a
  unit or a symbol is fine here ("₹1.2 cr", "3 weeks")
- swimlane: heading?, actors: [{ name, dot? (a CSS colour) }], stages: string[], cells:
  [{ actor, stage, body?, state? (STATE) }], legend? (an array of strings, never one joined
  string). Every cell's actor must equal one of the actors' name, and its stage one of the
  stages. Leave out a cell where that actor does nothing at that stage. Use when the content
  says who does what, at which stage.
- steps: heading?, steps: [{ label?, title, body, actorTag? }]. These render across as a row of
  cards, so keep title and body short. "actorTag" is who does it, and repeating the same tag
  across steps is right: each distinct tag gets its own colour.
- flowchart: heading?, nodes: [{ id, label }], edges: [{ from, to, label? }], decisions?, legend?.
  Every edge's from and to must equal a node's id. Give each node a short id ("consent") and put
  the words in its label. "decisions" is an array of NODE IDS that are decision points, drawn as
  diamonds: ["consent"], never a sentence about the decision. Label the edges out of a decision
  ("Yes", "No"). An edge from a node to itself is a loop and its label says how many times
  ("x12 weeks"). "legend" is an array of strings. Use for a process with branches.
- close: heading, sub?, contact?

Two escape hatches. Reach for them only when a real layout above genuinely cannot carry the
content, because a layout is reskinnable and these are not:
- image: asset (a URL or path, never invented), alt, caption?
- figure: svg?, caption?. SVG only, and only a plain drawing: no <style>, no script, no event
  handlers, no href. Styled HTML does NOT survive here. Never invent an asset path or an image
  that was not given to you; if the source has a diagram you cannot express, use a layout above
  and describe it, or leave it out and say so in "notes".

Rich text is either a plain string (shorthand for a single run) or an array of runs, for
example [{ "type": "text", "text": "Hello" }]. The run types, and what each is for:
- "text": ordinary words.
- "highlight": drawn in the theme's accent gradient. THIS IS THE DECK'S ONE FLOURISH, and it
  belongs on headings. Split a cover or section heading into two runs and highlight the second
  half, which is the part carrying the point:
    "heading": [{ "type": "text", "text": "One connected system, " },
                { "type": "highlight", "text": "no code required" }]
  Do this on most headings. A deck whose headings are all one flat run looks unfinished, and the
  gradient is the single thing that makes it look like a deck rather than a document.
- "strong": bold, for a lead-in phrase inside a bullet. "emphasis": italic, used sparingly.
- "code": a monospace fragment, for an identifier or a value.
- "link": { "type": "link", "text": "...", "href": "..." }. Never invent an href.
Rich text must say something: never an empty string and never an empty array. A slot with
nothing to say is left out.

${voiceBlock}

Turn this content into a deck:
---
${content}
---

Output the JSON now.`;
}

/**
 * Ask for a repair of output that did not validate.
 *
 * Generation is one slow call and the IR is strict, so a single bad value used to throw the
 * whole deck away and hand the author a raw Zod dump. On the first real corpus that was four of
 * the first eight decks: a "scale" given as a string, a swimlane state of "at risk", a card
 * without a body. Each was one field in one slide of an otherwise good deck.
 *
 * The errors are precise and name their own path, so they are worth far more to the model than
 * to the author. Handing them back is cheaper than regenerating from scratch and keeps the
 * writing that was already right. This is only affordable because the prompt goes in on stdin:
 * the invalid deck is itself too big for an argv-bound call.
 */
export function buildRepairPrompt(invalid: string, errors: string): string {
  return `The JSON below is a DeckTrail slide deck that failed schema validation. Fix it.

The validator's errors, each naming the path that is wrong:
---
${errors}
---

Change only what the errors point at. Keep every other slide, every heading, and all of the
wording exactly as it is: the writing is correct and only the structure is not. Do not drop a
slide to make an error go away, and do not add one.

Reminders on what the schema accepts:
- TONE is exactly one of: "neutral", "red", "green", "note".
- STATE is exactly one of: "good", "warn", "bad". Map anything else onto the nearest, or omit it.
- chart.series[].value and chart.scale are numbers. stat-grid.stats[].value is a string.
- Every card in a card-grid needs both a title and a body.
- An unknown slot is rejected: remove it rather than renaming it to something plausible.

The invalid JSON:
---
${invalid}
---

Output ONLY the corrected JSON object. No prose, no markdown code fences.`;
}
