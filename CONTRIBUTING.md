# Contributing to DeckTrail

Thanks for your interest. DeckTrail is open source under the AGPL-3.0, and contributions are
welcome.

Two things to read first, both short: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for how people
treat each other here, and [SECURITY.md](SECURITY.md) if what you found is a security problem,
because that does not go in a public issue.

## Getting set up

Requires Node 24 LTS and pnpm.

```sh
pnpm install
pnpm typecheck
pnpm test
```

### A note on `.githooks/`

The repository carries a `commit-msg` hook that rejects any commit message crediting an AI
tool: a `Co-Authored-By` trailer, a "Generated with ..." line, or the robot-emoji footer. It is
deliberately anchored to line starts, so writing *about* Claude or naming `CLAUDE.md` in a
message passes; only attribution is refused.

**It is the maintainer's, and it also pins the author to the maintainer's identity.** Do not
install it on a fork: it would reject your own commits, which is not what it is for.

```sh
git config core.hooksPath .githooks   # maintainer only
```

The repository is a pnpm workspace. Each package (`ir`, `renderers`, `portal`, `studio`,
`console`) has its own `typecheck` and `test` scripts; `pnpm -r <script>` runs across all of
them. See `docs/ARCHITECTURE.md` for how the pieces fit together and `docs/IR-SPEC.md` for the
intermediate representation.

The portal also has tests that need a real Postgres, and they skip themselves without one:

```sh
docker compose up -d db
./scripts/test-integration.sh
```

**Run these before touching the database layer.** They cover things a fake cannot: the atomic
single-use claim on a magic link is a `DELETE ... RETURNING`, and either the database does it
atomically or link replay works. While they were skipping, one of them had been failing since
a refactor and nobody knew.

And there is the whole journey, in a real browser, from an empty database to a client reading
a watermarked deck:

```sh
DT_E2E_IR=path/to/deck.ir.json ./scripts/e2e.sh            # watch it happen
DT_E2E_IR=path/to/deck.ir.json ./scripts/e2e.sh --headless # for CI
```

It wipes the stack, because the journey starts at first boot. **Run it before any release.**
Every failure it has caught was invisible to the unit suite and obvious to a person: a portal
whose root URL answered a raw 404 the moment setup finished, a client meeting
`{"error":"please sign in"}` with nowhere to sign in, and a magic link that answered
`{"ok":true}` and left you staring at it. The suite was green for all three.

## How we work

- **Verify before you commit.** Run `pnpm typecheck` and `pnpm test`, and exercise the real
  change where it runs (render the HTML, drive the route), not just the tests.
- **Keep it configurable.** No hardcoded values that should be settings; one authoritative home
  per setting, read from config.
- **Brand-neutral by default.** The product ships with neutral defaults. Anything specific to a
  particular company belongs in that operator's own configuration, not in the code.
- **One logical change per commit,** with a clear message and its docs updated in the same commit.
- **The threat model is the conscience of the project** (`docs/THREAT-MODEL.md`). We claim
  deterrence, attribution, and detection, never prevention. Do not add a feature that oversells.

## Reporting issues and requesting an attribution waiver

Open an issue on the project's tracker. To request permission to remove the "Made with
DeckTrail by OrbitQube" attribution, see `ATTRIBUTION.md` for the request process.

## License of contributions

DeckTrail asks contributors to sign a Contributor Licence Agreement (`CLA.md`). Add yourself to
`CLA-SIGNATURES.md` in your first merge request, and add a `DeckTrail-CLA-1.0-signed-off-by:`
trailer to your commits. Note this is **not** `git commit -s`: that trailer means the Developer
Certificate of Origin, which is a different document, and we are not going to redefine it
quietly to mean something with a commercial grant in it.

The short version: you keep your copyright; your contribution is released under the AGPL-3.0
and OrbitQube is bound to keep releasing it under the AGPL-3.0; and you additionally grant
OrbitQube the right to license it under other terms, including a paid commercial edition. That
option is how this project is meant to fund its own maintenance, and it only exists if one
party holds the rights to license the whole codebase.

We would rather you knew that up front than found it out later. If you would prefer not to
agree, please open an issue describing the change instead; a maintainer can implement it
independently, and the report is genuinely useful either way. `CLA.md` sets out the terms and
the reasoning in full.
