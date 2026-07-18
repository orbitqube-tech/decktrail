# The `decktrail` CLI

The studio: the half that runs on your machine. It writes decks, renders them, and pushes them
to your portal. It never runs on a server, and it holds no model credentials.

```sh
pnpm install && pnpm -r build
cd packages/studio && npm link && cd ../..   # puts `decktrail` on your PATH
decktrail <command>
```

The `npm link` step is optional: `decktrail` is exactly `node packages/studio/dist/cli.js`, so
you can call that path directly without linking. Run it with no arguments for the same summary
this page expands.

---

## `validate <file>`

Check an IR file is a real DeckTrail artifact before you send it anywhere.

```sh
decktrail validate deck.json
# valid: slide-deck
```

Prints `valid: <kind>` and exits 0, or `invalid: <why>` and exits 1. Accepts a slide deck, a
document, a tool, or a pack. **Run it in CI if you author IR by hand**; every other command
validates too, but this one is the cheap check that tells you which field is wrong.

---

## `render <file> [--out <file>] [--public | --confidential <text>]`

Render an IR file to one self-contained HTML file. No portal involved, no watermark, no
tracking: this is the "hand someone a file" path.

```sh
decktrail render deck.json --out preview.html
decktrail render talk.json --public --out talk.html
decktrail render deck.json --confidential "Under NDA" --out deck.html
```

| Flag | Effect |
|---|---|
| `--out <file>` | Write to a file. Without it, the HTML goes to stdout. |
| `--public` | Drop the confidentiality label. |
| `--confidential <text>` | Replace the label's text. |

Every deck is marked **"Private & Confidential"** unless you say otherwise, because a deck sent
to a client is the overwhelmingly common case and should not need a flag. Use `--public` for a
talk, a portfolio piece, or a marketing deck: anything meant to be handed around.

---

## `generate <content> [--out <file>] [--client <name>] [--voice ...] [--portal ... --token ...]`

Write a deck from your notes, using **your own Claude Code login**.

```sh
decktrail generate notes.md --client acme --out deck.json
decktrail generate notes.md --client acme --portal https://decks.you.com --token "$TOKEN"
```

Requires a Claude Pro or Max subscription, already logged in (`claude login`). It shells out to
the `claude` CLI in print mode. **There is no API key and no per-token cost**, and your content
never reaches the portal or us.

| Flag | Effect |
|---|---|
| `--out <file>` | Where to write the IR. Default `deck.json`. |
| `--client <name>` | **Who the deck is for.** Sets the workspace, which groups your decks in the console. |
| `--voice <file.json>` | A voice file to write in. |
| `--voice-md <file.md>` | Free-form guidance, folded into the voice's instructions. |
| `--portal <url>` `--token <t>` | Read the voice you set in the console. |

### Which voice it uses

Most specific first:

1. `--voice <file>`
2. `voice.json` in the directory you run the command from
3. **The console's voice**, if you pass `--portal` and `--token`
4. A neutral professional default

It prints which one it chose. Generating in the wrong register is a mistake you notice three
decks later, so it says so rather than guessing quietly.

### On `--client`

Give it. Left to inference, the model reads your notes and answers with whoever it sees, and on
an OrbitQube deck it answered "orbitqube", which is the *sender*. Every deck then lands in one
group named after you and the grouping does nothing. Who a deck is for is a fact you have.

---

## `push <file> --portal <url> --token <token> [--recipient <email>] [--theme <file>]`

Publish an IR to your portal, and optionally mint a share link.

```sh
decktrail push deck.json \
  --portal https://decks.you.com \
  --token "$DT_ADMIN_TOKEN" \
  --theme theme.json \
  --recipient client@acme.example
```

```
published: artifact art_bm-KbHy0CT9d, version 2
share: https://decks.you.com/d/shr_HKRBVjspyK_jSO9b
```

| Flag | Effect |
|---|---|
| `--portal <url>` | **Required.** Your portal. |
| `--token <token>` | **Required.** The admin token. See [Configuration](../guide/05-configuration.md#reading-a-generated-secret-back). |
| `--recipient <email>` | Mint a share for this person and let them sign in. |
| `--theme <file>` | Pin a theme to this version. |

Publishing **appends a version**; it never overwrites. A share is pinned to the version it was
made from, so republishing cannot change what someone was already sent.

> **`--recipient` does not email anyone.** It creates the link and lets that address sign in.
> **You send the link yourself.** This is a real gap, and it is on the list.

> **The token is an argument, so it lands in your shell history and in `ps`.** Read it from a
> file or an environment variable rather than typing it: `--token "$DT_ADMIN_TOKEN"`.

---

## `brand <url> [--out <file>]`

Read a website's colours and type into a `theme.json`.

```sh
decktrail brand https://www.acme.example --out theme.json
```

It fetches the page **and its own stylesheets** (same-origin only; third-party sheets are font
services and trackers, and are none of our business), then maps what it finds onto the theme
tokens.

**It will not get everything, and it says so here rather than in a support thread.** On a real
site it recovered five of ten tokens. A site that names its brand colour `--cyan` has told a
tool the hue, not the job, and no extractor infers intent from that. What it does:

- Reads CSS custom properties by conventional name: `--bg`, `--ink`, `--brand`, `--primary`,
  `--surface-1`, and the usual aliases.
- Falls back to **what your links and buttons are actually painted with** when no name matches,
  since the accent is the interactive colour.
- Takes the font from a Google Fonts link or a `font-family` declaration.
- Takes an icon or `og:image` as the logo, which is often a favicon and often too small.

Then open the console's Brand tab and finish it. Extraction is a head start, not an answer.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Fine. |
| `1` | Invalid IR, a missing required flag, a failed request, or generation failing to return usable JSON. The reason goes to stderr. |

---

## What the CLI never does

- **It never sends your content anywhere but your own portal.** Generation runs locally through
  your Claude Code login.
- **It never stores a credential.** The token is yours to pass; nothing is cached.
- **It never touches a deck someone is already reading.** Publishing appends.
