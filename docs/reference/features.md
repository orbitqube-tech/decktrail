# What DeckTrail does

Three lists: what works today, what is designed and not built, and what it refuses to do.

The second and third lists are the point. Any product page can tell you what it has.

---

## Ships today

### Sending a deck

| | |
|---|---|
| **Three artifact kinds** | Slide decks, scrolling documents, and an interactive pricing tool. A client engagement can mix all three behind one hub. |
| **Fifteen slide layouts** | cover, bullets, card-grid, table, steps, statement, comparison, callout, timeline, swimlane, flowchart, chart, stat-grid, tool-visual, close. Plus `image` and `figure` escape hatches for imported diagrams. |
| **Document blocks** | Prose sections, a table of contents, ranked lists, two-panel comparisons, known-gaps, source notes. |
| **A live pricing tool** | Add and remove lines, toggle them in and out, change numbers on the call, with group subtotals and a live total. Press `E` for presenter mode. The client's copy is always locked, and the portal serves it locked regardless. |
| **Immutable versions** | Publishing appends a version. A share link is pinned to the version it was made from, so republishing never changes what someone was sent. |
| **A link to the slide** | `#12` on a deck's URL opens it on slide 12, and reading the deck keeps the address current, so you can point someone at the slide that matters rather than the deck around it. |

### Who can read it

| | |
|---|---|
| **One link, one person** | A share is bound to one email address. Anyone else, signed in or not, gets a page that will not open it and does not say why. |
| **Passwordless sign-in** | A one-time link, valid 30 minutes, single use, claimed atomically so it cannot be spent twice. Only the hash is stored. |
| **Neutral answers** | "Check your email" whether or not the address is invited, so nobody can probe your client list. |
| **Sessions end when you say so** | Signing someone out revokes their session, and their next request stops. |
| **A door for your client** | A sign-in page wearing **your** brand, at the deck link, that returns them to the deck once they are in. |

### Knowing what happened

| | |
|---|---|
| **Per-viewer watermark** | Their address and the timestamp, tiled across the page, drawn at serve time. A screenshot carries it. A photo of the screen carries it. |
| **Who read what** | Opens, per-slide dwell, completion percent, first and last seen, per deck and per recipient. |
| **Attempt logging** | Copy, print, download, and context-menu attempts, recorded against a name. |
| **AI and scraper blocking** | Known agents get a 403 at the door and land in your log. `robots.txt` disallows them by name; every page carries `X-Robots-Tag: noai, noimageai, noindex, nofollow`. |
| **An audit trail you can take with you** | CSV export of every event. It is your data, in a format nothing owns. |

### Making it yours

| | |
|---|---|
| **Brand extraction** | Point `decktrail brand` at your website and it reads your colours and type out of your stylesheet. It will not get everything: a colour named "cyan" tells a tool the hue, not the job. You finish it in the console. |
| **Themes, applied at serve time** | Reassign a theme and the next open uses it. No republishing. |
| **Your voice, not ours** | Audience, tone, what to prefer, what never to use, and free-form "how I present" instructions. Set it once in the console; generation uses it. |
| **Your brand everywhere a client looks** | The sign-in page, the deck, the emails. Not ours. |

### Generating

| | |
|---|---|
| **From your notes** | `decktrail generate notes.md` writes the deck through **your own Claude Code login**. No API key, no per-token cost, and the portal never sees your content. |
| **Layouts, not CSS** | The model picks a layout and fills its slots. It cannot emit CSS or invent structure, so it cannot produce something broken or unbrandable. |
| **Write it by hand instead** | The IR is plain JSON. `decktrail validate` checks it. The generator is optional. |

### Running it

| | |
|---|---|
| **Self-hosted, entirely** | Postgres and one container. Your clients' decks never touch our infrastructure. We could not read them if we wanted to, which is a property of where it runs rather than a promise. |
| **No account, anywhere** | There is nothing to sign into here. |
| **Secrets generate themselves** | A fresh install needs one value: a database password. |
| **Setup locked to the operator** | First-run setup needs a token printed in your container log, so nobody who finds your portal first can claim it. |
| **Opt-in telemetry, off by default** | If you turn it on: an anonymous id, the version, and two bucketed counts, weekly. Never your content, clients, or viewers. |

---

## Designed, not built

Sound designs, worth building, currently absent. See `docs/THREAT-MODEL.md` for detail.

| | |
|---|---|
| **Per-slide streaming with a tripwire** | The deck is one HTML document today, so a patient scraper gets everything. This is the biggest gap. |
| **Alerting** | There is none, of any kind. Every signal is passive: it lands in the table and waits for you to look. |
| **Font cmap scrambling** | Copy would yield ciphertext. Not built. |
| **Steganographic fingerprinting** | An invisible per-recipient mark surviving a screenshot. Not built. The visible watermark carries attribution today. |
| **AI attribution beacon** | Invisible text so a model reworking your deck stamps the client's own name into its output. Not built. |
| **Protection tiers** | Open / Tracked / Guarded / Vault is a design. Every deck is Tracked. There is no selector. |
| **Revoking a share** | A share carries a `revoked_at` column and serving honours it, but nothing sets it: there is no route and no control. Sessions can be ended; a share cannot yet be withdrawn. |
| **Emailing the share link** | `push --recipient` mints the link and lets that person sign in. **You still send the link yourself.** |
| **Devtools detection** | Deferred on purpose: unreliable across browsers, and false positives are worse than nothing. |

---

## Will not do

Not "not yet". These are refusals.

| | |
|---|---|
| **Stop a camera** | A phone pointed at a monitor defeats everything here and always will. No mitigation exists. Anyone who tells you otherwise is selling something. |
| **Stop a screenshot** | The watermark rides along in the image. That is the whole answer. |
| **Stop someone retyping it** | Nothing can. |
| **Stop a determined person copying the text** | Anti-copy is friction. Devtools beats it in seconds. It is deterrence against the careless. |
| **Claim to be AI-proof** | It is not, cannot be, and the moment it claimed to be, it would deserve the takedown it got. |
| **Watch your clients for you** | No rendered deck ever contacts a domain this project controls. Doing so would mean we could see who reads your decks, which is exactly what this product exists to tell you not to accept. |
| **Faithfully import your PowerPoint** | Upload the content and DeckTrail rebuilds it in your brand and its layouts. Pixel-faithful PPTX import is a multi-year tarpit, and nobody actually wants their 2019 deck preserved exactly. |
| **Run your generation on our servers** | Version 1 generation is your machine, your subscription. The portal holds no model credentials. |

---

## Honest about the shape of it

The one-line summary: **a deck opens for one named person, carries their name while they read
it, and tells you afterwards what they did with it.**

Everything above either serves that or admits it does not. The list of what is missing is
longer than most products would print, and the list of refusals would not appear at all. Both
are here because a consultant deciding whether to hand this their client relationships deserves
to know where the floor is from us, rather than finding out from their client.

See `docs/THREAT-MODEL.md`, which is the authority whenever a claim here and the code disagree.
