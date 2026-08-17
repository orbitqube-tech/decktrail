# Cutting a release

A version number is a point somebody can install, cite in a bug report, and come back to. It is not
a running total of commits, so releases are cut deliberately, when there is something worth naming.

## The version lives in one place

`package.json` at the repository root. Nothing else carries it: the packages inside `packages/` are
private and unpublished, so a version in each would be several homes for one fact and they would
drift. `decktrail --version` reads that file, so what the tool reports and what the tag says cannot
disagree.

## What the numbers mean

`MAJOR.MINOR.PATCH`.

Before 1.0, **minor** carries features and anything that changes how you use the product, and
**patch** carries fixes that change nothing about how you use it. There is no 1.0 date, and there
will not be one announced before the thing is true: 1.0 means the deck intermediate representation is
stable enough that a deck written today still renders in a year.

A change to the IR that an existing deck cannot survive is a major change whenever it happens, and
`docs/IR-SPEC.md` is the contract that decides it.

## Cutting one

Both release gates first. They are gates, not suggestions, and the reason is written in
`CONTRIBUTING.md`: this repository has shipped a green test suite over a product that could not
deliver a deck to a human.

```sh
./scripts/test-integration.sh     # the database tests that otherwise skip themselves
./scripts/e2e.sh                  # the whole journey, real browser, empty database
```

Then:

1. **Write the changelog entry first.** `CHANGELOG.md`, newest at the top, written for somebody
   deciding whether to upgrade rather than for somebody reading commits. If an entry is hard to write
   because nothing user-visible changed, that is the answer: there is no release to cut.
2. **Set the version** in the root `package.json`.
3. **Commit** the two together, so the version and the account of it are never separate.
4. **Tag it**, annotated, with the changelog entry's own summary as the message.

   ```sh
   git tag -a v0.2.0 -m "0.2.0: one command to install, one line to steer a deck"
   ```

5. **Push the commit and the tag to both remotes, canonical first.** A version that exists in one
   and not the other is worse than no version.

   | Remote | Role | Where |
   |---|---|---|
   | `gitlab` | **Canonical.** Work happens here. | `gitlab.com/orbitqube/solutions/decktrail/decktrail` |
   | `origin` | **Public mirror.** Never branch, merge or commit against it. | `github.com/orbitqube-tech/decktrail` |

   ```sh
   git push gitlab main && git push gitlab v0.2.0
   git push origin main && git push origin v0.2.0
   ```

   The order is the point. Two remotes with no stated roles become two sources of truth, and they
   drift the first time a push reaches one and not the other, leaving nobody able to say which is
   right. Push the canonical remote, confirm the commit actually landed there by reading the
   remote rather than the exit code (`git ls-remote gitlab refs/heads/main`), and only then
   mirror. If the mirror is ever wrong, fix it on the canonical remote and push again rather than
   committing against the mirror.

Pushes are sequential and human-paced. There is no continuous integration doing this, on purpose.

## What a release is not

It is not a marketing event, and the changelog is not an announcement: it says what changed and what
that means for somebody using it. Anything that reads as a claim about the product belongs on the
site, where it can be held to `docs/THREAT-MODEL.md`.

A version is also not a promise of support for the one before it. There is one supported version, the
current one, and the upgrade path is `git pull` and the one command.
