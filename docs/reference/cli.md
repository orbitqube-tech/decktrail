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

Write a deck from your notes. It runs on your machine, and your content never reaches the portal
or us.

```sh
decktrail generate notes.md --client acme --out deck.json
decktrail generate notes.md --client acme --provider opencode --model opencode/nemotron-3-ultra-free
```

| Flag | Effect |
|---|---|
| `--out <file>` | Where to write the IR. Default `deck.json`. |
| `--client <name>` | **Who the deck is for.** Sets the workspace, which groups your decks in the console. |
| `--voice <file.json>` | A voice file to write in. |
| `--voice-md <file.md>` | Free-form guidance, folded into the voice's instructions. |
| `--provider <name>` | Which model backend: `claude` (default) or `opencode`. |
| `--model <provider/model>` | Which model, for backends that take one. OpenCode wants a `provider/model` pair. |
| `--command <bin>` | Where the backend's binary lives, if it is not on your PATH under its usual name. |
| `--repair-attempts <n>` | How many times to hand an invalid deck back for repair. Default 2. |
| `--timeout-ms <n>` | How long one model call may run. Default 600000, ten minutes. |
| `--portal <url>` `--token <t>` | Read the voice you set in the console. |

### Which model writes the deck

| Provider | What it needs | What it costs |
|---|---|---|
| `claude` (default) | A Claude Pro or Max subscription, already logged in (`claude login`). Shells out to `claude` in print mode. | Nothing beyond the subscription. No key, no per-token cost. |
| `opencode` | The [OpenCode](https://opencode.ai) command line tool installed and configured. | Whatever its model costs. A model on your own hardware (Ollama, LM Studio, llama.cpp) and OpenCode's own free tier both cost nothing. A hosted tier needs a key, which you give to OpenCode, never to DeckTrail. |

DeckTrail never holds a model credential either way. It spawns the tool you already use and reads
what it writes.

It prints which backend and which model ran before it starts. Two models write visibly different
decks from the same notes, and you cannot account for the difference if you cannot see which one
wrote it.

A smaller model gets the writing right and the schema wrong more often than a large one. That is
what the repair loop is for; raise `--repair-attempts` rather than giving up on a model.

### Which voice it uses

Most specific first:

1. `--voice <file>`
2. `voice.json` in the directory you run the command from
3. **The console's voice**, read live from the portal, if a portal and token are configured
4. **The local cache of the console's voice**, when the portal cannot be reached
5. A neutral professional default

It prints which one it chose, and when it falls back to the cache it prints where that cache came
from and how old it is. Generating in the wrong register is a mistake you notice three decks
later, so it says so rather than guessing quietly.

An unreachable portal never stops generation. You have already chosen your notes and your client
by then, and a worse voice is a better outcome than no deck. Run `decktrail voice pull` before you
go offline and the register comes with you.

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

## `voice pull` and `voice show`

`voice pull` reads the voice you set in the console and caches it on this machine. `voice show`
prints the voice generation would actually use, and where it came from.

```sh
decktrail voice pull          # before a flight, before a site visit, before the wifi goes
decktrail voice show
```

The console is where the voice lives; the cache is a dated copy of it, and a live read always
wins and always refreshes the copy. When the portal cannot be reached, generation falls back to
the cache and says so, naming the portal it came from and how many days old it is. A cache taken
from a different portal is refused rather than used, because that is somebody else's register.

The cache is one file, `.decktrail/voice.cache.json` under your home directory. Nothing else
writes it.

---

## `config show`

Prints every setting, its resolved value, and which layer set it.

```sh
decktrail config show
```

Settings resolve in this order, most specific first: a command line flag, then an environment
variable, then `.decktrail/config.json` in the directory you are in, then the same file under your
home directory, then the built-in default. The layer is printed beside each value, because a
setting that looks right in a file and is being overridden somewhere else is the failure this
column exists to make visible.

| Setting | Environment variable | Default |
|---|---|---|
| Portal URL | `DT_PORTAL_URL` | not set |
| Admin token | `DT_PORTAL_TOKEN` | not set |
| Generation backend | `DT_GENERATE_PROVIDER` | `claude` |
| Model | `DT_GENERATE_MODEL` | the backend's own default |
| Backend binary | `DT_CLAUDE_COMMAND`, `DT_OPENCODE_COMMAND` | `claude`, `opencode` |
| Repair attempts | `DT_GENERATE_REPAIR_ATTEMPTS` | `2` |
| Call timeout | `DT_GENERATE_TIMEOUT_MS` | `600000` |
| Voice cache freshness budget | `DT_VOICE_CACHE_MAX_AGE_DAYS` | `30` |

```json
{
  "portal": { "url": "https://decks.you.com", "token": "..." },
  "generate": { "provider": "opencode", "model": "opencode/nemotron-3-ultra-free" }
}
```

**The admin token is never printed**, by this command or any other. It is reported as set or not
set. `.decktrail/` is gitignored here, and you should gitignore it wherever you keep your content
too. Past the freshness budget a cached voice is still used and the warning sharpens: generating a
deck is not a money path, and refusing to write one because a register is a month old would cost
you more than it protects.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Fine. |
| `1` | Invalid IR, a missing required flag, a failed request, or generation failing to return usable JSON. The reason goes to stderr. |

---

## What the CLI never does

- **It never sends your content anywhere but your own portal.** Generation runs locally, through
  whichever backend you configured.
- **It never holds a model credential.** Whatever a model backend needs to authenticate belongs to
  that backend's own configuration, not to DeckTrail.
- **It never puts your admin token anywhere you did not.** `config show` reports it as set or not
  set and never prints it. Storing it in `.decktrail/config.json` is offered so it stops appearing
  in your shell history; that file is gitignored, and keeping the token in the environment or on
  the command line still works.
- **It never touches a deck someone is already reading.** Publishing appends.
