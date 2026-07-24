# CLAUDE.md

Notes for an AI assistant working on DeckTrail, and for anyone who finds them useful.

> **Maintainer:** your full working instructions, the resume path, and the pre-public review
> are in the companion repository, not here. Read `CLAUDE-decktrail-maintainer.md` there first.
> This file is the public one, and it deliberately holds nothing that is not everybody's.

---

## What this is

An open source, self-hosted product that lets a freelancer or consultant send a client a
branded, gated, watermarked, tracked web deck, and know afterwards what happened to it.

The bet: a client who receives your deck can paste it into a language model and regenerate your
thinking. Nothing stops that. So DeckTrail is built for what is left, which is knowing whose
copy it was.

Read `README.md` first, then `docs/README.md`, which indexes everything else.

## The rules that matter here

**1. Never claim prevention.** DeckTrail claims deterrence, attribution, and detection. It does
not stop a camera, a screenshot, or a retype, and it never says it does. `docs/THREAT-MODEL.md`
is the conscience of the project: if a line of code, a document, or a piece of copy disagrees
with it, the threat model wins.

The threat model was itself rewritten once because it had claimed controls that did not exist.
**The rule applies to us before it applies to anyone else.** Before you describe a capability,
check it exists.

**2. Run it. Do not trust the tests.**

The suite has been green while: any signed-in address could read any deck by URL; the README's
own install instructions handed out a published admin token; a client clicking their link got
raw JSON with nowhere to sign in; and the console's Voice tab wrote to a row nothing read. All
of it was found by using the product, none by testing it.

```sh
./scripts/e2e.sh              # the whole journey, real browser, empty database
./scripts/test-integration.sh # the database tests that otherwise skip themselves
```

Both are release gates. A test that stubs the thing it is testing proves nothing, and this
repository has shipped several.

**3. This repository is public. Write everything in it for a stranger.**

Every file here is read by someone who cloned DeckTrail and knows nothing about how it got this
way. Two consequences, and both are absolute:

- **Nothing private lives here.** No client name, no client content, no internal review, no
  commercial material. Those go in the companion repository. `acme-logistics` is the fixture
  client. Run `git grep -i` for the real ones before every commit; they have come back three
  times, hours after a scrub, because the task at hand made them the nearest example to reach for.
- **The documentation describes the product, not its history.** It is written for the person
  using DeckTrail: what it does, how to run it, what it will not do. Never "this used to", never
  "we changed", never a reference to a review or a decision that a reader cannot see. Every
  document reads as though the current version is the only version there has ever been. The
  reasoning behind a reversal belongs in `docs/DECISIONS.md`, which exists for exactly that and
  is the one place a reader is told why.

Keep what is useful and keep it true. A stale document is worse than a missing one: the missing
one sends the reader to the code, and the stale one sends them somewhere wrong with confidence.
When behaviour changes, the document changes in the same commit or the change is not finished.

**4. Do not guess a value you cannot see.** Four separate bugs came from one habit: code that
could not see the workspace defaulted it to `"default"`, while publish read it from the IR.
Every guess was silent and every one was wrong. If you do not know, fail, ask, or derive it.

**5. No em dashes,** anywhere: code, docs, commit messages. En dashes for numeric ranges only.
The renderers' tests are the one exception, because a test asserting the output contains no em
dash has to name the character it is looking for. Do not "fix" those.

**6. Explain every acronym on first use.** See `docs/GLOSSARY.md`.

**7. No hardcoded values.** One authoritative home per setting. This project exists because the
prior art hardcoded a brand.

**8. Commits carry no AI attribution.** A `commit-msg` hook in `.githooks/` enforces it. It
also pins the author to the maintainer, so **do not enable it on a fork**; see
`CONTRIBUTING.md`.

## Layout

| Package | What it is |
|---|---|
| `packages/ir` | Zod schemas. A deck is JSON. This is the boundary: constrain values here, not at the renderer. |
| `packages/renderers` | Pure functions, IR plus theme to HTML. Standalone and portal (watermarked) variants. |
| `packages/portal` | Fastify, Drizzle, Postgres. Auth, the admin API, and serving gated decks. |
| `packages/generate` | The generation engine: prompt, repair loop, and the model providers. A library: no filesystem, no argv, no portal, and it never reads the environment. |
| `packages/ingest` | Bytes in, text out. PDF, PowerPoint, Word, and images, with OCR only when a document carries no text of its own. Re-authors, never converts (D4, D26). Runs on the author's machine, never the server. |
| `packages/studio` | The `decktrail` CLI: validate, render, generate, push, brand, voice, config. Owns everything `generate` deliberately does not: argv, files, settings, the portal. |
| `packages/console` | The owner's React dashboard, served at `/admin`. |

`docs/DECISIONS.md` holds every settled decision and supersedes anything that contradicts it,
including this file. Read it before proposing a change to how something works: several
decisions were reversed after evidence, and the reasoning is recorded with them.

## Where the sharp edges are

- **`packages/portal/src/content.ts`** decides who may read a deck. It had no test and shipped
  without checking the recipient. Treat it accordingly.
- **`packages/portal/src/config.ts`** refuses to boot on any secret placeholder this repository
  has ever published. That is not paranoia; it happened.
- **`packages/renderers/src/sanitize.ts`** is an allowlist, on purpose. Widen it deliberately or
  not at all.
- **The in-memory fakes must match the real stores.** They diverged once, and the tests passed
  against the permissive one while production silently did nothing.
