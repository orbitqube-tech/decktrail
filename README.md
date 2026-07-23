# DeckTrail

**Your decks, private to each client and traceable. Self-hosted and free.**

You send a client your best thinking and, most of the time, hear nothing back. DeckTrail gives
the work you send a home you own: a branded, gated, watermarked web deck, delivered to one named
person over a one-time sign-in link, with a clear record of who opened it, how far they read, and
for how long. It is built for the age of large language models, where a document you send can
resurface anywhere, reworded and unattributed. When that happens, attribution is the part that
still travels, so attribution is what DeckTrail gives you.

It is open source and self-hosted. You run it yourself, on your own infrastructure, with
your own data. There is no SaaS in the path, no per-seat fee, and no third party between you
and your client.

## Two parts: the studio and the portal

DeckTrail is two things, and keeping them apart is the point:

- **The studio is the generator.** It runs on **your own machine**. You turn notes into a deck
  (optionally generating with your own Claude login), edit and validate it, then `push` the
  finished deck to a portal. It never runs on a server, and no model credential ever leaves your
  machine.
- **The portal is the deployment.** It runs on **your own host**, a VPS or any box with Docker,
  and does one job: ingest finished decks and serve them gated, watermarked, and tracked. It holds
  no model credential and never generates anything.

So the day-to-day loop is **build locally, host remotely**: generate and edit on your machine,
`push` to the portal, and it serves. You never install or log in Claude on the server, because it
does not need it. See [Build locally, host remotely](docs/guide/04-sending-and-tracking.md#build-locally-host-remotely).

## New here? Follow this path

If you just cloned this, read these in order. Each one hands off to the next, so you are never
left guessing what comes after.

1. **This README** for what DeckTrail is, then the [one-command start](#quickstart) below.
2. **[Quickstart](docs/guide/01-quickstart.md)** to a deck a client can open, in about fifteen
   minutes.
3. **The rest of the guide, in order:** [writing decks](docs/guide/02-writing-decks.md),
   [your brand and voice](docs/guide/03-brand-and-voice.md),
   [sending and tracking](docs/guide/04-sending-and-tracking.md),
   [configuration](docs/guide/05-configuration.md), [going live](docs/guide/06-going-live.md),
   and [troubleshooting](docs/guide/07-troubleshooting.md).
4. **[What it cannot do](docs/THREAT-MODEL.md)** before you trust it with a real client. It is the
   honest answer, and the reason to trust the rest.

The full documentation index is [docs/README.md](docs/README.md).

## Why

A deck you email sits in an inbox, gets forwarded without a trace, and pastes into a model
in one click. A deck you host with DeckTrail is gated to a person, watermarked to them, and
tracked. The watermark makes any leak traceable to the individual who leaked it. That
attribution is the real control, and DeckTrail is honest that nothing stops a determined
screenshot; the goal is friction plus attribution, not absolute prevention.

## What you get

- **Gated sharing.** Per-recipient links behind a passwordless magic-link sign-in, so every
  open ties to a real person.
- **Per-viewer watermark and anti-copy friction** injected at serve time, plus blocking of
  known AI and scraper agents.
- **Analytics that tell you who is reading:** opens over time, per-deck and per-recipient
  engagement, per-slide dwell, and a first-class panel of scrape attempts.
- **A live pricing tool** for commercials: a locked client view, and a presenter mode where
  you edit lines and totals live on the call.
- **Your brand, not ours.** Per-artifact themes with your own colours, type, and logo,
  managed from the console.
- **Your voice.** Deck generation writes in a register you configure, not a default baked in by
  anyone else. It runs on your own machine either way: through your Claude Code login, or through
  OpenCode against a model on your own hardware or a free tier.

## Quickstart

DeckTrail is a single Docker Compose stack (a Fastify portal, PostgreSQL, and a React owner
console served at `/admin`).

```sh
git clone https://github.com/orbitqube-tech/decktrail
cd decktrail
cp .env.example .env
# Set POSTGRES_PASSWORD in .env. It is the only value you must choose.
# Leave the secrets empty: the portal generates and persists them on first boot.
docker compose up
```

Then find your setup link in the log:

```sh
docker compose logs portal | grep setup
```

It prints a URL with a one-time token. Open it, and the first-run wizard asks for your admin
email, brand, and mail settings, and invites you.

The token exists because setup decides who the administrator is, and at that moment there is
nobody to ask. Anyone who reached an un-setup portal first would become its admin, so setup is
locked to whoever can read the server's log, which is you. The token is burned once setup
completes; if setup ever reopens, a new one is printed.

Send mail through an authenticated mail service (see `.env.example`), never straight from the
app's own host, or it will land in spam.

## How it works

The product is a small pnpm workspace:

- `@decktrail/ir`: the intermediate representation: your content as structured JSON, once.
- `@decktrail/renderers`: turn the IR into self-contained HTML (deck, document, pricing
  tool), standalone or portal-served with the watermark and beacon.
- `@decktrail/portal`: magic-link auth, gated and watermarked serving, versioning, the
  analytics event model, and the ingest API.
- `@decktrail/studio`: the `decktrail` command line tool (validate, render, generate, push,
  brand extraction).
- `@decktrail/console`: the React owner console (analytics, brand, and voice).

## Documentation

**[docs/README.md](docs/README.md)** is the index. The three worth knowing about:

- **[Quickstart](docs/guide/01-quickstart.md)** to a deck a client can open, in about fifteen
  minutes, ending with your own portal refusing to show you someone else's deck.
- **[What it cannot do](docs/THREAT-MODEL.md)**, which is the honest answer and the one to read
  before you trust this with a real client.
- **[Configuration](docs/guide/05-configuration.md)**: every setting, which of the three places
  it lives in, and which one wins when two disagree.

`docs/ARCHITECTURE.md` has the design, `docs/GLOSSARY.md` the acronyms, and
`docs/DECISIONS.md` every settled decision and why, including the ones that were reversed.

## Development

Requires Node 24 LTS and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm demo         # render the example deck and open it
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the details, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) the
short version of how people treat each other, and [SECURITY.md](SECURITY.md) how to report a
vulnerability, which is privately and not in an issue.

## License and attribution

DeckTrail is licensed under the **GNU Affero General Public License v3.0** (see `LICENSE`).

Each rendered deck carries a small **"Made with DeckTrail by OrbitQube"** mark. **The licence
does not require it, and you can turn it off without asking us.**

We are asking instead. DeckTrail is free and self-hosted: there is no trial funnel and no
hosted tier steering anyone back to us, so a consultant noticing that mark on a deck is the
only way the next person finds this project. If DeckTrail is useful to you, leaving it on is a
fair way to pay that forward. If you would rather not, that is fine and you owe us no
explanation. `ATTRIBUTION.md` explains why we ask, and why we decided not to demand it.

The **names** "DeckTrail" and "OrbitQube" are trademarks, and they are the one thing we do ask
about. Run it, modify it, fork it, sell services with it, all without asking. Just give your
fork its own name. See `TRADEMARK.md`.

Contributions are welcome under a contributor licence agreement (`CLA.md`), which lets this
project offer a commercial licence alongside the AGPL. `CONTRIBUTING.md` has the details and is
upfront about what it means.

DeckTrail is a project by [OrbitQube](https://www.orbitqube.com).
