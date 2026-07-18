# Your brand and your voice

Two things make a deck yours: how it looks (the theme) and how it reads (the voice). Both are
configuration with one authoritative home, never hardcoded, so a deck comes out looking and
sounding like you and not like the maintainer (decisions D12, D14, D16).

---

## Your brand (the theme)

A theme is colors, a font family, and a logo. It is applied per artifact, so different clients
can carry different looks from one portal.

### The fields

| Field | What it is |
|---|---|
| `colors.bg`, `surfaceLow`, `surfaceHigh` | Page and card backgrounds. |
| `colors.accent`, `accent2` (plus their `Dim` variants) | The two brand colors; headings and highlights use the gradient between them. |
| `colors.text`, `heading`, `muted` | Body, heading, and secondary text. |
| `typography.family` | The font, embedded at render so a client's browser fetches nothing. |
| `logo.src` | Your logo as a data URI, with an optional `wordmark`. |

### Setting it

**In the console.** Sign in at `/admin`, open the **Brand** tab, and create a theme. Assign it
to an artifact from the same tab. This is the path most operators use day to day.

**From a file.** Keep a `theme.json` and pass it at publish or render time:

```sh
decktrail render deck.json --theme theme.json --out preview.html
decktrail push  deck.json --theme theme.json --portal <url> --token <token> --recipient user@decktrail.orbitqube
```

**Extracted from a website.** As a starting point, pull colors and a logo from a live site:

```sh
decktrail brand https://acme.example --out theme.json
```

It gets you part of the way (a real site rarely exposes every token), then you finish it in the
console or the file. A hue-named brand color, for instance, cannot be inferred and is set by hand.

> The font is embedded into every rendered deck, so the deck is fully self-contained and a
> client opening it fetches nothing from anyone. Fetch the font once at deploy with
> `pnpm fetch-fonts`; without it, decks fall back to the system font.

---

## Your voice

The voice shapes what the generator writes: the tone, the audience, the words to prefer and
avoid, and any house rules. It only affects generation; it changes nothing about a hand-written
deck.

### The fields

A voice is a small JSON object: a `name`, the `audience` you write for, a `tone`, lists of
`preferred` and `forbidden` words or constructions, a `locale`, and free-form `instructions`.
See `voice.example.json` in the repo for the shape.

### Setting it

**In the console.** The **Voice** tab stores one voice for the portal. Generation reads it when
you pass `--portal <url> --token <token>`, so you do not need a local file.

**From a file.** A `voice.json` in the directory you run the command from, or an explicit `--voice voice.json`, wins
over the console copy. This is handy for trying a register without changing the portal default.

```sh
decktrail generate notes.md --client acme --voice voice.json --out deck.json
```

The resolution order is: `--voice` file, then a local `voice.json`, then the console voice, then
a neutral default. The neutral default is deliberate: your first deck should sound like you, not
like anyone else, so nothing is assumed until you set it.

---

## The "Made with DeckTrail" mark

Every rendered deck carries a small "Made with DeckTrail by OrbitQube" mark. The license does
not require it and you can turn it off in your theme without asking anyone (decision D19). We ask
you to keep it, because a free self-hosted tool has no other way for the next person to find it.
That is the whole of it: a default and a request, never a rule. See
[ATTRIBUTION.md](../../ATTRIBUTION.md).

## Next

- [Sending and tracking](04-sending-and-tracking.md) to share a branded deck and watch it.
- [Configuration](05-configuration.md) for where every setting lives and which wins.

---

<!-- guide-nav -->
**The guide:** [← Writing a deck](02-writing-decks.md) · [All docs](../README.md) · [Sending and tracking →](04-sending-and-tracking.md)
