# Measuring how well pages are read

This directory is a scorecard for optical character recognition (OCR, reading text off a picture).
It draws a set of deliberately awkward pages, reads them back through this package's `extract`,
and scores each reading four different ways.

It exists because recognition quality is a matter of degree and a test suite cannot express
degree. A test can assert that extraction returned something. It cannot tell you whether swapping
one recognition engine for another, or spending a larger model tier, or preprocessing the image
first, made the reading better or worse. Without a number for that, every choice in this package
is a matter of taste.

## The rule this harness exists to serve

**No number in this package that decides behaviour may be a guess, and every one of them must
name the run it came from.**

That covers the confidence floor, the characters-per-page value that marks a page as a scan, the
default model tier, and anything else of the kind. A number without evidence behind it is a
decision somebody made once, in a hurry, that everything downstream then treats as a fact. If you
change one of those values, run the scorecard, keep the JSON file it writes, and cite it where the
constant is defined.

The runner enforces nothing, on purpose. It contains no threshold, no pass mark and no failing
exit code. It measures. Deciding what is good enough is a judgement that belongs where the
constant lives, next to the evidence.

## Running it

Both commands are run from the repository root.

```sh
# 1. Draw the corpus. Writes images and their ground truth into evals/tmp/corpus.
pnpm exec tsx packages/ingest/evals/generate-corpus.ts

# 2. Read every page with every engine at every model tier, and print the scorecard.
pnpm exec tsx packages/ingest/evals/run.ts
```

The full sweep is every page times every engine times every tier, which takes a few minutes. While
you are iterating, narrow it:

```sh
pnpm exec tsx packages/ingest/evals/run.ts --engines=paddle,tesseract --tiers=auto
```

The first command needs the optional `@napi-rs/canvas` package, which is what draws the pages. If
it is missing, the generator says so by name rather than failing with a module resolution error.
The second needs whatever the recognition engine needs, which may include fetching its model files
the first time it runs.

The scoring functions have their own unit tests, which run with the package's ordinary suite:

```sh
pnpm --filter @decktrail/ingest test
```

### Options

Both scripts take `--name=value` arguments and default nothing silently.

| Argument | Applies to | Meaning |
|---|---|---|
| `--out=<dir>` | both | Where to write. The corpus, or the scorecard JSON. |
| `--corpus=<dir>` | run | Which corpus to read. Defaults to the one the generator writes. |
| `--engines=<a,b>` | run | Which engines to sweep. Defaults to all of them. An unknown name stops the run rather than being dropped. |
| `--tiers=<a,b>` | run | Which model tiers to sweep. Defaults to all of them. An unknown name stops the run rather than being dropped. |
| `--languages=<a,b>` | run | Recognition languages, passed straight through. Not sent at all when not given. |
| `--model-path=<dir>` | run | A local directory of model files, which is what keeps a run fully offline. |

Everything is written under a directory named `tmp`, which the repository ignores at any depth.
Generated output that can be committed eventually is.

### What comes out

```
case               asked      tier    engine that ran        char err  word err  numeric   order     seconds
clean-prose        auto       auto    <engine>/<model>       0.001     0.008     1.000     1.000     1.481
number-table       tesseract  auto    <engine>/<model>       0.094     0.543     0.639     1.000     2.408
two-column         paddle     tiny    <engine>/<model>       0.731     0.872     1.000     0.960     0.140
```

That is the shape of the output, not a set of reference values, and the numbers in it must never be
quoted as though they were.

Three of those columns are worth being precise about:

- **asked** is the entry of the sweep: an engine by name, or `auto` for whatever the package itself
  chooses, which is the path a real ingestion takes and so deserves a row of its own.
- **engine that ran** is the string the reading reported for itself, exactly as it reported it. It
  will differ from what was asked when a fallback happened, which is the point of printing both. A
  reading that named no engine at all is shown as `(unnamed)`, because a measurement nobody can
  reproduce is not a measurement.
- **seconds** covers the extraction only, and the first reading an engine does in a process pays
  for loading its models. Compare durations between an engine's later rows, not against its first.

The same rows go to a timestamped JSON file, plus a copy at `scorecard-latest.json`, along with the
corpus that was read, the machine it ran on, the warning codes each reading raised, any engine that
could not run here and why, and the text that came back. Keep the file. Two scorecards are how you
answer "did that change help", and the returned text is the only way to see why a score moved.

Expect the answer to be mixed. An engine that reads a dense table far better than the other one can
be far worse on a page that is slightly rotated, and a mean across six pages will hide that
completely. That is why the table is per page and the means are underneath it rather than instead of
it.

## The four scores, and what each one cannot see

Two of them are error rates where **0 is perfect**. Two are accuracies where **1 is perfect**. The
names say which is which, and so does every comment in `metrics.ts`.

| Score | Direction | What it measures | What it is blind to |
|---|---|---|---|
| `characterErrorRate` | 0 is perfect | Edit distance over characters, as a share of the expected length. The general-purpose measure. | What kind of character was wrong. A misread comma costs exactly what a misread digit costs. Also blind to order. |
| `wordErrorRate` | 0 is perfect | The same, over whitespace-separated words. Harsher, and closer to what a model re-authoring the text experiences. | Near misses. A word with one wrong letter costs as much as a word that vanished entirely. |
| `numericAccuracy` | 1 is perfect | The share of the numbers in the page that come back exactly. | Invented numbers: it is recall only. A lost minus sign. A page with no numbers scores 1, so read it beside `expectedNumericTokens`, which every scored row carries. |
| `readingOrderFidelity` | 1 is perfect | The share of adjacent line pairs still adjacent, and in that order, in the reading. | Content: perfect order and total nonsense scores 1. Columns that were merged rather than resequenced, which stays high while the text is interleaved. |

`numericAccuracy` is the one that justifies the whole file. A character error rate scores a wrong
digit and a wrong comma identically, and on a page carrying money, dates, headcounts or dosages
they are not the same event at all. A seven digit figure that loses one digit is wrong by an order
of magnitude while the character rate barely moves, and it reaches the reader looking entirely
plausible. That failure has to have its own number or it does not exist.

`readingOrderFidelity` is the second one, for the same reason from the other direction. A dense two
column page can be flattened into an interleaving of two arguments, every word present and the
meaning gone, and the character rate hardly notices because all the characters are there.

No score here is meaningful on its own, which is why the runner always reports all four.

## The corpus, and its limits

Six pages, each isolating one thing that is known to break recognition:

| Case | Catches |
|---|---|
| `clean-prose` | The easy baseline. If this is not nearly perfect, nothing else measured means anything. |
| `dense-small-text` | Footnote sized text with tight leading, where character shapes collide. |
| `number-table` | Seven digit figures, decimals, signed percentages and dates. |
| `two-column` | Two columns whose halves continue each other, so reading across the page produces fluent nonsense. |
| `low-contrast` | A faded photocopy, at roughly half the contrast a person is considered able to read comfortably. |
| `skewed-page` | A few degrees of rotation, which is the ordinary state of a scan. |

The pages are generated rather than committed, and the ground truth is derived from the same array
of strings the image is drawn from. Nobody transcribes anything, so the truth cannot drift from the
picture, and no binary fixtures enter the repository.

**A synthesized corpus cannot replace real documents, and no threshold should ever be set from this
one alone.** These pages have no scanner noise, no compression artefacts, no ink bleed from the
reverse of the sheet, no handwriting in the margin, no stamp across the total, and no photograph
taken at an angle under a desk lamp. They are clean pages made difficult in one controlled way
each, which makes them good for comparing two engines against each other and useless as evidence
that any absolute accuracy will hold on a client's contract.

Two further limits, both worth knowing before you compare two numbers:

- The pages are drawn in the machine's default sans-serif face, because this repository ships no
  font files for drawing with. Two scorecards are therefore only comparable when they were produced
  on the same machine. The manifest records the family that was asked for.
- An engine that needs an optional package which is not installed is named once, dropped from the
  sweep, and recorded in the scorecard as unavailable with the reason it gave. It is not scored as a
  failure, because "this machine cannot run it" and "it read the page badly" are different facts.
  A scorecard with an engine missing is still a scorecard; it is just a narrower one.

Before any accuracy threshold is written into this package, it needs a corpus of real documents,
kept outside this repository because real documents belong to the people who wrote them, and read
with the same runner. Until then the scorecard answers "which of these two is better here", which
is a genuinely useful question, and not "how good is it", which it cannot answer.

## The files

| File | What it is |
|---|---|
| `metrics.ts` | The four scores and the edit distance they are built on. Pure functions. |
| `metrics.test.ts` | Hand-worked examples for every score, including the digit that must never silently pass. |
| `generate-corpus.ts` | Draws the pages and derives their ground truth. |
| `run.ts` | Reads the corpus with every engine at every tier, scores it, prints the table, writes the JSON. |

## What the first runs found

Recorded here so that nobody rediscovers it, and so that the claims made elsewhere about these two
engines can be checked against the run that produced them. All of it comes from the generated
corpus, so read every line as a comparison between engines and never as a statement of accuracy.

- **PP-OCR is much better on dense text and on figures.** On the table of figures its medium tier
  read every number correctly, against 64 percent for the fallback. On small dense text it made
  roughly a twentieth of the character errors.
- **PP-OCR fails badly on a page skewed by three degrees**, where the fallback barely notices it. It
  returned two lines out of twelve and lost every figure, while reporting a mean confidence of 0.83.
  The cause was measured, not assumed: the engine's own confidence filter discards the low scoring
  detections that a rotated line produces, and lowering that filter on the same page recovered all
  twelve lines. The filter is still at the engine's default, because a lower one also admits logos
  and rule lines as text and no run here measures that trade yet. Lower it only with a run attached.
- **A confident and mostly empty reading is the worst outcome this package can produce**, and
  confidence does not catch it: 0.83 on a page that lost eighty percent of its text. That is why
  every recognised result carries a warning rather than only the low scoring ones.
- **A bigger tier is not reliably better.** Medium beat tiny outright on the table of figures and
  was worse than tiny on dense small text, while costing several times the time. The default stays
  the engine's own smallest tier until a run on real documents says otherwise.
- **Neither engine wins on the mean, and the mean is the least useful number here.** The fallback
  has the better average only because of the skewed page; PP-OCR wins on every case where the text
  is dense or numeric. Averaging six deliberately different failures into one figure hides exactly
  the trade that matters, which is why the table prints per case and the summary is last.
- **The engine's result cache had to be turned off before anything could be measured.** It is keyed
  on the picture and not on the settings the picture was read with, so every tier returned the first
  tier's answer. It was caught because three different models reported a confidence identical to
  sixteen decimal places, which is not something three different models do.
