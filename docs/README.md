# DeckTrail documentation

Everything here is written for one of three people. Find yourself, and start there.

| You are | Start here | Time |
|---|---|---|
| **Trying DeckTrail for the first time** | [Quickstart](guide/01-quickstart.md) | 15 minutes to a deck a client can open |
| **Running it for real** | [Configuration reference](guide/05-configuration.md) | Every setting, where it lives, what it does |
| **Deciding whether to trust it** | [What it cannot do](../docs/THREAT-MODEL.md) | 5 minutes, and it is the honest answer |

---

## The guide

1. **[Quickstart](guide/01-quickstart.md)** Install it, set it up, send yourself a deck, then
   watch your own portal refuse to show you someone else's. Fifteen minutes, nothing assumed.
2. **[Configuration](guide/05-configuration.md)** Every setting, which of the three places it
   lives in, and which one wins when two disagree.

**Not written yet**, and listed so you know they are missing rather than that you failed to find
them: writing decks by hand, brand and voice in depth, sending and tracking, going live, and
troubleshooting. The Quickstart covers the path through all of them; these would go deeper. If
you hit something the Quickstart does not answer, that is a documentation bug and worth an
issue.

## Reference

- **[Feature list](reference/features.md)** What exists, what is designed and not built, and
  what this deliberately refuses to do. The last two lists are the point.
- **[CLI reference](reference/cli.md)** Every command, flag, and exit code.
- **[The IR](IR-SPEC.md)** The JSON a deck actually is.
- **[Glossary](GLOSSARY.md)** Every acronym, in plain language.

The HTTP API has no page yet. Routes are readable in `packages/portal/src/app.ts`, and each one
says what authorises it.

## Understanding the project

- **[Threat model](THREAT-MODEL.md)** What DeckTrail protects against, and the three things it never will.
- **[Architecture](ARCHITECTURE.md)** How the pieces fit.
- **[Decisions](DECISIONS.md)** Every settled decision and why, including the ones we reversed.
- **[Attribution](../ATTRIBUTION.md)** The mark on your decks, and why it is a request rather than a rule.
- **[Trademark policy](../TRADEMARK.md)** What you may do with the name.
- **[Contributing](../CONTRIBUTING.md)** How to work on it.

---

## The shape of the thing, in one picture

```
   You                                    Your client
    │                                          │
    │  decktrail generate notes.md             │
    │  ──────────────────────────►  deck.json  │
    │                                  │       │
    │  decktrail push deck.json        │       │
    │  ──────────────────────────►  ┌──▼─────────────────┐
    │                               │  Your portal        │
    │  console at /admin            │  (your server)      │
    │  ◄─────────────────────────►  │                     │
    │      who read what            │  gates, watermarks, │
    │                               │  and records        │
    │                               └──────────▲──────────┘
    │                                          │
    │  you send them the link ────────────────►│  they sign in
    │                                          │  and read it
```

Three things run: **the studio** (a CLI on your machine), **the portal** (a container on your
server), and **the console** (a page in your browser, served by the portal). Nothing runs on
ours. There is no account with us, and there is nothing to sign into here.

## A note on what this documentation will not do

It will not tell you DeckTrail stops anyone from taking your work. It does not, it cannot, and
the [threat model](THREAT-MODEL.md) says so on its first page. If that is what you need, no
software sold today can honestly offer it, and you should be suspicious of anything that claims
otherwise.

What is here is what actually works: a deck that opens for one named person, carries their name
while they read it, and tells you afterwards what they did with it.
