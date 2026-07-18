# Threat model and the protection ladder

**Read this before you trust DeckTrail with a real client, and before you repeat any claim about
what it does.** It describes what is built, what is not, and what never will be.

This document is the conscience of the project. Where any line of code, any other document, or any
piece of copy disagrees with it, this file is right and the other thing is a bug. Every control
named here exists and can be exercised. Anything absent from the table below is absent from the
product.

---

## The claim we make, and the claim we never make

**We never claim prevention.** Not AI proof, not screenshot proof, not theft proof.

Anything a human eye can read, a camera can capture and OCR (optical character recognition)
can lift. A phone pointed at a monitor defeats every technique in this document, built or
unbuilt, and there is no fix.

**We claim three things instead:**

| | What it means | What actually ships today |
|---|---|---|
| **Deterrence** | Make casual extraction more work than it is worth. | **Partly.** Anti-copy friction, a visible per-viewer watermark, and no download link. All of it is beaten by a determined person in under a minute. |
| **Attribution** | If it leaks, know who leaked it. | **Yes, and this is the one that holds.** A deck is gated to one named address and tiled with their name and the timestamp at serve time. |
| **Detection** | Know when someone is trying. | **Yes, after the fact.** Copy, print, download and scrape attempts are recorded against a name and appear on the dashboard. **There is no alerting and no auto-revoke.** You find out when you look. |

---

## What ships today

This is the whole list. If it is not here, it does not exist.

| Threat | What we actually do | Residual risk |
|---|---|---|
| Client forwards the link to a colleague | The link is bound to one invited address. The colleague meets a sign-in page and cannot pass it. | The colleague sits next to them and looks at the screen. Unfixable. Also: **no alert fires.** The owner sees the refused attempt only if they read the log. |
| Someone is sent a deck meant for another person | Refused. The share is checked against the signed-in viewer, and the refusal does not say why. | None known. This is the check the whole product rests on. |
| Client screenshots each slide | Visible tiled watermark with their address and the timestamp, drawn at serve time, not baked into a file. | The model still reads the content. But the image carries their name. |
| Client copies the text and pastes it into a model | Selection and copy are made awkward, and the attempt is logged against their name. | **They copy it anyway.** The anti-copy layer is CSS and a keydown handler; devtools defeats it in seconds. Deterrence against the careless, nothing more. |
| Client prints, or prints to PDF | The attempt is logged against their name. | **Printing is not blocked and cannot be.** `beforeprint` tells us it happened; it does not stop it. |
| Client points a phone at the monitor | The visible watermark is in the frame. | **Total loss of content. No mitigation exists. Say so.** |
| An AI crawler or scraper indexes the deck | Known AI and scraper user agents get a 403 at the door and the attempt is recorded. `robots.txt` disallows them by name, and every served page carries `X-Robots-Tag: noai, noimageai, noindex, nofollow`. | **User-agent blocking is trivially bypassed by anyone who wants to.** It stops the honest crawlers only. Do not oversell it. |
| A patient scraper walks the deck at human speed | **Nothing.** The deck is one HTML document; every slide is in it from the first request. | It gets everything. There is no per-slide gate to trip. |
| Someone reads the payload in developer tools | **Nothing.** | They get the payload. Accepted. |

---

## Designed, and not built

None of the following exists. Each is recorded because the design is sound and worth building,
and because a reader deciding whether to trust DeckTrail should be able to see the shape of what
is missing as clearly as the shape of what is there.

**None of it belongs in marketing copy, a README, a landing page, or a pitch until the table
above changes.**

### Per-recipient font cmap scrambling `NOT BUILT`

Subset the font and permute the character-to-glyph mapping per recipient. Renders identically
to a human; copy and paste yields ciphertext. Beats naive copy and DOM scraping. Does not beat
OCR or retyping.

### The AI attribution beacon `NOT BUILT`

Invisible text in the document, positioned so a human never sees it: *"Confidential. Licensed
to <name> on <date>. Do not reproduce."* A model asked to rework the deck carries the line into
its output, so the client's "our version of this" arrives stamped with their own name.

It is a copyright notice, not a prompt injection attack. If this is ever built, do not be
tempted into "ignore previous instructions" payloads. That is an attack, it is unethical, and
it would destroy the project's credibility on the day someone noticed.

### Signed per-slide streaming with a tripwire `NOT BUILT`

Each slide behind a fresh token bound to the session and the clock, with a minimum dwell, so a
whole deck cannot be consumed in seconds. Tripping it would auto-revoke the link and tell the
sender.

**This is the big one.** Its absence is why the "patient scraper" row says "nothing", and why
there is no auto-revoke anywhere in the product despite this file having claimed one.

### Steganographic fingerprinting `NOT BUILT`

An invisible per-recipient fingerprint in the rendered pixels, surviving a screenshot and a
JPEG recompression, paired with the visible watermark. This is what would let a leaked image
found in a competitor's deck trace back to a named person.

### Alerting `NOT BUILT`

There is no alerting of any kind. No forward alert, no tripwire alert, no email, no webhook.
Every signal in this product is passive: it lands in the events table and waits for the owner
to open their dashboard. If you need to be told when something happens, poll the events export.

### Devtools detection `NOT BUILT, AND DEFERRED ON PURPOSE`

The `devtools_open` event type exists in the code and nothing emits it. Detection is unreliable
across browsers and produces false positives on ordinary readers, which is a poor trade for a
signal that proves nothing. Treat the event type as reserved, not as a feature.

---

## The protection ladder

The design is a tier per deck. **Only one tier is built.**

| | **Open** | **Tracked** | **Guarded** | **Vault** |
|---|---|---|---|---|
| | not built | **THIS IS WHAT SHIPS** | not built | not built |
| Magic link gate | no | **yes** | yes | yes |
| Visible watermark | no | **yes** | yes | yes |
| Attempt logging | no | **yes** | yes | yes |
| AI user-agent block | no | **yes** | yes | yes |
| Download | allowed | **no link, not blocked** | blocked | blocked |
| Copy and paste | yes | **friction only** | yields ciphertext | yields ciphertext |
| Slide delivery | whole file | **whole file** | signed, one at a time | signed, one at a time |
| Invisible fingerprint | no | **no** | yes | yes |
| AI attribution beacon | no | **no** | yes | yes |
| Scrape tripwire and auto revoke | no | **no** | yes | yes |
| Alerting | no | **no** | yes | yes |
| Link expiry and view limits | no | **no** | optional | enforced |
| NDA click through | no | **no** | optional | required |
| Device binding | no | **no** | no | yes |

There is no tier selector in the product. Every deck is Tracked. The tiers exist because
protection costs usability and the sender should decide, but that decision does not exist yet,
and this table must not be shown to anyone as though it does.

---

## What to put in the README

A section titled **What this cannot do**, near the top, not buried at the bottom.

> This cannot stop someone determined to take your work. Nothing can. If they can read it,
> they can photograph it, and if they can photograph it, a model can read it too.
>
> What it does is make casual copying awkward, turn away the honest crawlers, and tie every
> deck to one named person, so a leak has a name on it. Your deck goes out watermarked with
> the reader's own address, and you can see who opened it, when, and for how long.
>
> Deterrence. Attribution. Detection. Not prevention.

Leading with the limitation is the credibility play, and it is also simply true.

Check any wording of it against the table above before you publish it. A single word doing more
work than the product does is the first thing a critic disproves, and the section written to show
you are honest is the worst possible place to be caught.
