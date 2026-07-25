# @decktrail/ingest

Bytes in, text out.

This package takes a file somebody sent you, a PDF, a PowerPoint deck, a Word document, a scan or
a photograph, and pulls the words out so a deck can be re-authored from them. It runs on your own
machine. The portal never parses an uploaded file, so it gains no attack surface from one.

The reading itself is the shared, open source [`@orbitqube/oq-ai-ocr`](https://www.npmjs.com/package/@orbitqube/oq-ai-ocr)
library; this package is DeckTrail's thin surface over it, so the same implementation serves every
tool that reads a document. What follows describes the behaviour you get through it.

It re-authors, it does not convert. Layout, styling, masters, and anything carried purely by a
picture do not survive. What survives is the substance, which then gets rebuilt in your own
layouts and your own brand. See `docs/DECISIONS.md`, D4 and D26.

## What it reads

| Format | How the text is found |
|---|---|
| PDF with a text layer | Read directly out of the file. Exact. |
| PDF that is a scan | Pages are rendered to images and recognised. Never exact. |
| PowerPoint (`.pptx`) | Read out of the slide XML. |
| Word (`.docx`) | Read out of the document XML. |
| Image (PNG, JPEG, GIF, BMP, TIFF, WEBP) | Recognised. Never exact. |
| Anything else | Treated as plain text. |

The format is decided from the file's bytes, not from its name. An extension is a claim, and a
`.pdf` that is really a Word export is a file this path meets constantly. The name is consulted
only when the bytes are genuinely ambiguous.

## Text before pictures

Optical character recognition (OCR, reading words off a picture) is the fallback, never the
default. Running it over a document that already carries its own text is slower and produces a
worse result than the text sitting right there.

A PDF's text layer is read first and measured. A page must yield at least
`MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER` characters, averaged across the document, before that text
layer is believed. A scanned page is often not empty: it carries a stray header, a page number, or
the debris of a font that did not embed, and a plain "is it empty" test would wave it through as a
real document.

Three modes, set with `ocr`:

| Mode | Behaviour |
|---|---|
| `auto` (default) | Recognise only when the document carries no usable text of its own. |
| `never` | Never recognise. Fast, and makes no network call. |
| `force` | Recognise even over a text layer, for an export whose own text is worse than the page it sits on. |

## Using it

```ts
import { extract } from "@decktrail/ingest";
import { readFile } from "node:fs/promises";

const result = await extract(await readFile("proposal.pdf"), {
  filename: "proposal.pdf",
  ocr: "auto",
  onProgress: (m) => console.error(m),
});

console.log(result.engine);        // which reader produced this, exactly
console.log(result.warnings);      // read these before you use the text
console.log(result.text);          // the whole document in reading order
```

From the command line, `decktrail extract <file>` prints the same thing, and exists so you can
read an extraction before you spend a model call on it. Its flags and settings are in
`docs/reference/cli.md`.

## What comes back

The result is a versioned contract. It carries `contractVersion`, and a caller that reads a
version it does not know should fail rather than guess what the rest of the object means.

| Field | What it is |
|---|---|
| `kind` | What the file turned out to be. |
| `text` | The whole document in reading order, normalised. |
| `pages[]` | Each page or slide: its 1-based number, its text, its `source`, and its confidence. |
| `pages[].source` | `text_layer` when the text came out of the file, `ocr` when it was recognised. Per page, because one PDF routinely mixes a born-digital page with a scanned insert. |
| `usedOcr` | True when any part of the text was recognised. |
| `usedAi` | True when a model was called. Always false here. This package calls no model. |
| `engine` | Exactly which engine and model tier ran, for example `ppu-paddle-ocr/PP-OCRv6_tiny`. `none` when nothing needed recognising. |
| `confidence` | Mean detection confidence across the document. Absent, never zero, when nothing was recognised. |
| `warnings[]` | Coded, see below. |
| `truncated` | True when a page ceiling or any internal cap dropped content. Nothing is ever dropped quietly. |

## The two readers

PP-OCR (a family of text recognition models) reads dense text and figures materially better than
the fallback does, and a page that is even slightly rotated materially worse. Neither reader wins
everywhere, and `evals/README.md` records the run those statements come from. It is optional,
because it is large:

| Package | Installed size |
|---|---|
| `onnxruntime-node` | roughly 259 MB |
| `ppu-paddle-ocr` and the rest | the balance of roughly 312 MB total |

Those numbers were measured by installing the packages into a clean directory. A third of a
gigabyte in everybody's install, for a path most people never take, is not a trade this project
makes. So Tesseract compiled to WebAssembly ships as the always present fallback, and PP-OCR is
one install away:

```sh
pnpm add --filter @decktrail/ingest ppu-paddle-ocr onnxruntime-node
```

When PP-OCR is absent, extraction still works: the fallback reads the page, the result carries an
`engine_unavailable` warning naming the fallback that ran and what to install, and `engine` names
what actually read your document. You are never left guessing which reader produced a given
result.

You may see pnpm report that it skipped `onnxruntime-node`'s install script. That is expected and
nothing is broken: the processor binaries the engine needs ship inside the package itself, and that
script exists to download the graphics card binaries, which nothing here uses. `pnpm-workspace.yaml`
denies it deliberately, so the install needs no answer to a prompt.

Both readers run on this machine. No document is sent anywhere. A hosted vision service would read
a poor scan better than either, and is deliberately not offered: sending a client's document to a
third party to be read breaks the promise this product makes about where your content goes.

## Making a run fully offline

Two honest caveats, and how to close each one.

**The models are fetched once.** The first recognition run downloads its model files, roughly
6 MB, and caches them. Your document is never uploaded, but that first run is not an offline
operation. Point `modelPath` at a local directory of model files and no network call is made:

```ts
await extract(bytes, { modelPath: "/opt/decktrail/ocr-models" });
```

`ocr: "never"` also makes a run offline, by not recognising anything at all.

**A scanned PDF needs a native package to become images.** Turning PDF pages into pictures uses
`@napi-rs/canvas`, an optional dependency for the same reason: most people never ingest a scan and
should not install a native binary for a path they will not take. When it is missing, the failure
names the package and what to do instead of surfacing a module resolution error.

## Warning codes

Every warning carries a stable `code` as well as a human readable `message`. A sentence can only
be shown to a person. A code can be tested for, counted, and acted on, and these are surfaced
rather than swallowed because the failure mode of ingestion is quiet and plausible: text that is
subtly wrong reads exactly like text that is right.

| Code | Meaning |
|---|---|
| `ocr_used` | Some text was recognised rather than read. Always raised when it was. |
| `no_text_layer` | A PDF carried no usable text of its own. |
| `text_layer_thin` | A text layer existed but fell below the characters-per-page floor, so it was treated as a scan. |
| `ocr_disabled` | Recognition was needed and the mode was `never`, so little or nothing came back. |
| `page_empty` | A page yielded nothing. |
| `truncated` | A cap dropped content, naming what was dropped. |
| `engine_unavailable` | The preferred engine could not be loaded, naming the fallback that ran. |

Three further codes are part of the vocabulary and are **never raised by this package today**. They
are listed so that a consumer can handle the full set without waiting on one that cannot arrive:
`low_confidence`, which needs a confidence floor and no floor exists here yet, because no run has
measured where one belongs; `format_partial`, for a format carrying more than text could capture;
and `ai_used`, which exists so a result stays readable by a consumer that does call a model. This
package calls none.

## Recognised text can be wrong

Read it before you use it. Recognition is never perfect, and the mistakes it makes are exactly the
kind that survive a skim. A test line reading "Pilot fee is 18 lakh rupees" came back as "Pilotfee
is I 8 lakh rupees". A model handed that will carry it into a slide without hesitating, and the
slide will look fine.

That is why `decktrail extract` exists, why every result naming recognised text carries a warning,
and why `pages[].source` tells you which pages to distrust. Extract to a file, correct it, then
generate from the corrected file.

A file that yields nothing readable is a failure that says so, not an empty success.

## Accuracy is measured

The package carries an evaluation harness that measures character error rate, word error rate,
numeric accuracy, and reading order fidelity against a generated corpus. Numeric accuracy is
measured separately from character error rate because a fee misread by one digit is a different
kind of wrong from a misspelt heading, and an aggregate error rate hides it. It exists so that no
number in this package that decides behaviour is a guess.

## Licence

AGPL-3.0-only, as with the rest of DeckTrail.
