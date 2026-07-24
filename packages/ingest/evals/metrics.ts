/**
 * How to score one reading of a page against what the page actually said.
 *
 * Recognition quality is a matter of degree. A test can assert that extraction returned
 * something, and that is all it can do: it cannot tell you whether swapping one recognition
 * engine, model tier, or preprocessing step for another made the reading better or worse. These
 * functions exist so that question has a number attached to it, and so every threshold this
 * package ships can name the measurement it came from.
 *
 * Four scores, because no single one is honest on its own. A character error rate is the
 * general-purpose measure and it is blind to the two failures that actually cost an author
 * money: a figure that lost a digit, and a two column page flattened into nonsense. Each score
 * below therefore carries, in its own comment, what it is blind to. Read those before you read
 * the number.
 *
 * Everything here is pure: text in, number out, no clock, no filesystem, no engine.
 */

/**
 * Character error rates above this are reported as they are rather than clamped.
 *
 * Kept as a named value so the scorecard printer and the tests agree on what "worse than total
 * failure" looks like. An error rate of 1 means the engine got nothing right; a rate above 1
 * means it also invented text that was not there, and flattening the two would hide the
 * difference between an engine that read nothing and an engine that hallucinated a page.
 */
export const TOTAL_FAILURE_ERROR_RATE = 1;

/**
 * What counts as a number.
 *
 * A run of digits, optionally continuing through single `.` or `,` separators that are each
 * followed by more digits. So `1,284,530`, `3.14` and `2026` are each one token, while the
 * `2026-07-24` in a date becomes three (`2026`, `07`, `24`) because a hyphen is far more often a
 * date separator or a dash than a minus sign, and splitting a date is a smaller lie than reading
 * a hyphen as a negative. A trailing separator is never swallowed, so `Total: 4,096,118.` yields
 * `4,096,118` and not `4,096,118.`.
 */
export const NUMERIC_TOKEN_PATTERN = /\d+(?:[.,]\d+)*/g;

/** One reading, scored every way this harness knows how. */
export interface MetricScores {
  /** 0 is perfect. May exceed 1. */
  characterErrorRate: number;
  /** 0 is perfect. May exceed 1. */
  wordErrorRate: number;
  /** 1 is perfect. */
  numericAccuracy: number;
  /** 1 is perfect. */
  readingOrderFidelity: number;
  /** How many numeric tokens the expected text contained, so a numeric score of 1 on a page with no numbers is visible as such. */
  expectedNumericTokens: number;
}

/**
 * Put both texts into the one shape the scores are defined over.
 *
 * Neither side of this comparison is authored for byte equality. The expected text is written by
 * the corpus generator and the actual text comes back from an engine that makes its own decisions
 * about spacing, so comparing raw would charge every score for whitespace nobody cares about.
 *
 * Blind to: indentation, column alignment, blank line grouping, and trailing spaces. If a change
 * you are measuring is meant to improve any of those, none of these scores will see it.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Any run of whitespace that is not a line break, which includes the non-breaking spaces
    // that arrive from a PDF text layer and would otherwise read as a different character.
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/** The normalised lines of a text, which is what the reading order score is defined over. */
export function textLines(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  return normalized === "" ? [] : normalized.split("\n");
}

/**
 * Levenshtein distance over any sequence: the fewest single-item insertions, deletions and
 * substitutions that turn one sequence into the other.
 *
 * Written out here rather than pulled in, because it is a dozen lines, because a dependency in a
 * measuring tool is a dependency whose version can move the numbers, and because the same routine
 * has to run over characters for one score and over words for another.
 *
 * Only two rows of the matrix are ever alive at once. The full matrix would be the size of one
 * text times the other, which on a dense page is millions of cells for a number that never needs
 * the path back.
 */
export function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  if (b.length === 0) return a.length;
  if (a.length === 0) return b.length;

  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = new Array<number>(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * Levenshtein distance between two strings, counted in code points rather than UTF-16 code units
 * (UTF-16 being the encoding a JavaScript string is stored in).
 *
 * The difference matters the moment a document carries an emoji, a currency symbol outside the
 * basic plane, or a CJK character: those occupy two code units each, so counting units would
 * charge two errors for one wrong character and quietly inflate every score on a non-Latin page.
 */
export function levenshteinDistance(a: string, b: string): number {
  return editDistance([...a], [...b]);
}

/**
 * CHARACTER ERROR RATE. 0 is perfect. Lower is better, which is the opposite of every other score
 * in this file, so the name says "error" and the comment says it twice.
 *
 * Edit distance divided by the length of the expected text: the share of the original that had to
 * be repaired. It is the standard measure and it is the right general-purpose one, because it
 * charges for insertions and deletions as well as substitutions, so an engine that drops half a
 * page cannot hide behind the half it read.
 *
 * The result is not clamped. An engine that invents text scores above 1, and it should.
 *
 * Blind to: what kind of character was wrong. A misread comma and a misread digit cost exactly
 * the same here, which on anything carrying money or dates is not remotely the same failure, and
 * is the entire reason `numericAccuracy` exists. Also blind to order: text read in the wrong
 * sequence can score well if the characters are all present in roughly the right places.
 *
 * An empty expected text has no length to divide by. When the actual is empty too there is
 * nothing to get wrong, so the rate is 0; when the actual has content, the engine produced text
 * where there was none, and that is reported as total failure rather than as infinity so a
 * scorecard column stays readable.
 */
export function characterErrorRate(expected: string, actual: string): number {
  const want = normalizeWhitespace(expected);
  const got = normalizeWhitespace(actual);
  if (want === "") return got === "" ? 0 : TOTAL_FAILURE_ERROR_RATE;
  return levenshteinDistance(want, got) / [...want].length;
}

/**
 * WORD ERROR RATE. 0 is perfect. Lower is better.
 *
 * The same edit distance, over whitespace-separated tokens instead of characters. It is the
 * harsher of the two and the more useful one for re-authoring: a word with one wrong letter is
 * still a wrong word to a model reading the extraction, and the character rate would have
 * charged that a few percent while this charges it in full.
 *
 * Blind to: everything the character rate is blind to, plus near misses. `commitment` read as
 * `cornmitment` costs one whole word here, exactly as much as a word that vanished. Use both
 * rates together: a large gap between them means many words are slightly wrong rather than a few
 * words being entirely wrong.
 *
 * Punctuation stays attached to its word on purpose. Stripping it would be a second normalisation
 * that quietly forgives a misread decimal point.
 */
export function wordErrorRate(expected: string, actual: string): number {
  const want = normalizeWhitespace(expected).split(/\s+/).filter((w) => w !== "");
  const got = normalizeWhitespace(actual).split(/\s+/).filter((w) => w !== "");
  if (want.length === 0) return got.length === 0 ? 0 : TOTAL_FAILURE_ERROR_RATE;
  return editDistance(want, got) / want.length;
}

/** Every numeric token in a text, in the order it appears. */
export function numericTokens(text: string): string[] {
  return [...text.matchAll(NUMERIC_TOKEN_PATTERN)].map((m) => m[0]);
}

/**
 * The form two numbers are compared in.
 *
 * Group separators are removed, so `1,284,530` and `1284530` are the same number, because a
 * dropped thousands comma changes no value and engines drop them constantly. A period is kept,
 * because it may be a decimal point and removing it would make `3.14` equal `314`, which is the
 * one mistake this whole score exists to catch.
 *
 * The cost of that choice, and it is a real one: in a locale that writes `1.284.530`, the periods
 * are group separators and this treats them as decimal points, so such a document will score
 * numeric errors it does not have. Nothing in this package knows the document's locale, and
 * guessing it would be worse than being blind to it.
 */
export function normalizeNumericToken(token: string): string {
  return token.replace(/,/g, "");
}

/**
 * NUMERIC ACCURACY. 1 is perfect. Higher is better.
 *
 * The share of the numbers in the expected text that come back exactly. This is the score that
 * matters most and the reason the general metrics are not enough: a character error rate treats a
 * wrong comma and a wrong digit identically, and on a page carrying money, dates, headcounts or
 * dosages they are not the same event. A seven digit figure that loses one digit is off by an
 * order of magnitude while barely moving the character rate, which is exactly the failure that
 * reaches a client as a confident, plausible, wrong number.
 *
 * Matching is by multiset, not by position: each expected number is satisfied by one unused
 * occurrence in the actual text. So a page whose numbers are all present but read in a different
 * order still scores 1 here, and it is `readingOrderFidelity` that has to catch that.
 *
 * Blind to: numbers that were invented. This is recall only, so an engine that emits every
 * expected figure plus a page of garbage digits scores 1. It is also blind to a lost minus sign,
 * since the sign is not part of a token, and to a number that was read as a word.
 *
 * A text with no numbers in it scores 1, because nothing was lost. Read that with the
 * `expectedNumericTokens` count beside it: 1 out of 0 is not evidence of anything.
 */
export function numericAccuracy(expected: string, actual: string): number {
  const want = numericTokens(expected).map(normalizeNumericToken);
  if (want.length === 0) return 1;

  const available = new Map<string, number>();
  for (const token of numericTokens(actual).map(normalizeNumericToken)) {
    available.set(token, (available.get(token) ?? 0) + 1);
  }

  let survived = 0;
  for (const token of want) {
    const remaining = available.get(token) ?? 0;
    if (remaining > 0) {
      available.set(token, remaining - 1);
      survived++;
    }
  }
  return survived / want.length;
}

/**
 * Which line of the actual text is most likely to be this expected line.
 *
 * Pairing by exact equality would be useless: one misread character would make a line unfindable,
 * and the order score would collapse into a restatement of the character score. Pairing by lowest
 * character error rate keeps the two questions separate, which is the point: "was it read
 * correctly" and "was it read in the right sequence" are different failures with different fixes.
 *
 * Ties go to the earliest line, so the result does not depend on iteration order.
 */
function nearestLineIndex(line: string, candidates: readonly string[]): number {
  let best = -1;
  let bestRate = Number.POSITIVE_INFINITY;
  for (const [i, candidate] of candidates.entries()) {
    const rate = characterErrorRate(line, candidate);
    if (rate < bestRate) {
      bestRate = rate;
      best = i;
    }
  }
  return best;
}

/**
 * READING ORDER FIDELITY. 1 is perfect. Higher is better.
 *
 * Of the adjacent line pairs in the expected text, the share that are still adjacent, and still
 * in that order, in the actual text.
 *
 * A dense two column page is the case this exists for. Read column by column it makes sense; read
 * straight across the page it becomes an interleaved mush of two arguments, every word present
 * and the meaning gone. The character error rate barely moves, because all the characters are
 * there. This score falls off a cliff, because almost no pair of neighbours survives.
 *
 * Each expected line is first paired with the actual line it most resembles, so ordinary
 * recognition noise does not count as a reordering.
 *
 * Blind to: the other way a column layout fails. A two column page can be re-sequenced, which
 * this catches, or merged, where the engine returns each pair of side by side lines as one line.
 * In the merged case every expected line pairs to the line that contains it and those pairs run
 * in sequence, so this score stays high while the text is interleaved. The character error rate
 * is what catches that one, and it is one reason no score here is ever read on its own.
 *
 * Blind to: content. A page read in perfect order and complete nonsense scores 1 here, so this
 * number means nothing without an error rate beside it. Blind also to how a line is delimited: an
 * engine that returns a whole page as one long line scores 0 no matter how well it read, and an
 * engine that splits every line in two scores badly for a formatting difference rather than a
 * reading one. Repeated identical lines, such as a running header, both pair to the first
 * occurrence and so cost the pairs around them.
 *
 * A text of fewer than two lines has no adjacent pairs, so there is no order to get wrong and the
 * score is 1. An actual text with no lines at all scores 0: nothing survived because nothing came
 * back.
 */
export function readingOrderFidelity(expected: string, actual: string): number {
  const want = textLines(expected);
  const got = textLines(actual);
  if (want.length < 2) return 1;
  if (got.length === 0) return 0;

  const paired = want.map((line) => nearestLineIndex(line, got));
  let preserved = 0;
  for (let i = 0; i < paired.length - 1; i++) {
    const here = paired[i] ?? -1;
    const next = paired[i + 1] ?? -1;
    if (here >= 0 && next === here + 1) preserved++;
  }
  return preserved / (want.length - 1);
}

/**
 * Every score for one reading, in one object.
 *
 * The runner writes this straight into its scorecard, so the field names are the column names and
 * the JSON is the record. Scoring everything every time is deliberate: a run that measured only
 * the metric someone was interested in that day cannot be compared with the run before it.
 */
export function scoreAll(expected: string, actual: string): MetricScores {
  return {
    characterErrorRate: characterErrorRate(expected, actual),
    wordErrorRate: wordErrorRate(expected, actual),
    numericAccuracy: numericAccuracy(expected, actual),
    readingOrderFidelity: readingOrderFidelity(expected, actual),
    expectedNumericTokens: numericTokens(expected).length,
  };
}
