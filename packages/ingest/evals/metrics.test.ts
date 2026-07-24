import { describe, it, expect } from "vitest";
import {
  characterErrorRate,
  editDistance,
  levenshteinDistance,
  numericAccuracy,
  numericTokens,
  readingOrderFidelity,
  scoreAll,
  textLines,
  wordErrorRate,
} from "./metrics.js";

/**
 * Every example here is small enough to work out by hand, and the expected value is written as
 * the arithmetic that produces it rather than as a decimal. A scoring function that is subtly
 * wrong is worse than no scoring at all: it produces confident numbers, thresholds get set from
 * them, and nothing ever announces the mistake.
 *
 * The case that must never silently pass is a number losing a digit. It is checked twice: once
 * that the numeric score reports total loss, and once that the character error rate stays small,
 * because the gap between those two numbers is the entire argument for having both.
 */

describe("edit distance", () => {
  it("is zero for identical input and equal to the length when one side is empty", () => {
    expect(levenshteinDistance("proposal", "proposal")).toBe(0);
    expect(levenshteinDistance("proposal", "")).toBe(8);
    expect(levenshteinDistance("", "proposal")).toBe(8);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("counts one operation per single change", () => {
    expect(levenshteinDistance("depot", "depat")).toBe(1); // substitution
    expect(levenshteinDistance("depot", "depots")).toBe(1); // insertion
    expect(levenshteinDistance("depots", "depot")).toBe(1); // deletion
  });

  it("agrees with the textbook example", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("works over tokens as well as characters, which is what the word rate needs", () => {
    expect(editDistance(["the", "depot", "opens"], ["the", "depot", "closes"])).toBe(1);
    expect(editDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("character error rate, where 0 is perfect", () => {
  it("scores identical text as perfect", () => {
    expect(characterErrorRate("The pilot runs for eight weeks.", "The pilot runs for eight weeks.")).toBe(0);
  });

  it("charges one substitution against the length of the expected text", () => {
    // "hello world" is 11 characters and one of them is wrong.
    expect(characterErrorRate("hello world", "hallo world")).toBeCloseTo(1 / 11, 10);
  });

  it("ignores whitespace that carries no meaning", () => {
    expect(characterErrorRate("two  words", "two words")).toBe(0);
    expect(characterErrorRate("line one\n\nline two", "line one\nline two")).toBe(0);
  });

  it("reports total failure when nothing was read", () => {
    expect(characterErrorRate("abc", "")).toBe(1);
  });

  it("reports 0 for an empty expected text only when nothing was invented", () => {
    expect(characterErrorRate("", "")).toBe(0);
    // There was no text on the page and the engine produced some anyway.
    expect(characterErrorRate("", "phantom heading")).toBe(1);
  });

  it("goes above 1 when text was invented, rather than clamping", () => {
    // One expected character, four returned: three insertions plus one substitution over a
    // length of one. Clamping this to 1 would make a hallucinated page look like an empty one.
    expect(characterErrorRate("a", "wxyz")).toBeCloseTo(4 / 1, 10);
  });
});

describe("word error rate, where 0 is perfect", () => {
  it("scores identical text as perfect", () => {
    expect(wordErrorRate("the quick brown fox", "the quick brown fox")).toBe(0);
  });

  it("charges a whole word for a single wrong letter", () => {
    // Four expected words, one of them not the expected word.
    expect(wordErrorRate("the quick brown fox", "the quick brawn fox")).toBeCloseTo(1 / 4, 10);
  });

  it("charges the same for a dropped word as for a wrong one", () => {
    expect(wordErrorRate("the quick brown fox", "the quick brown")).toBeCloseTo(1 / 4, 10);
  });

  it("handles both sides being empty, and one side being empty", () => {
    expect(wordErrorRate("", "")).toBe(0);
    expect(wordErrorRate("", "invented words here")).toBe(1);
    expect(wordErrorRate("three words here", "")).toBe(1);
  });
});

describe("numeric tokens", () => {
  it("keeps a grouped figure whole and drops the punctuation around it", () => {
    expect(numericTokens("Total: 4,096,118.")).toEqual(["4,096,118"]);
    expect(numericTokens("A margin of 12.5% on 1,284,530")).toEqual(["12.5", "1,284,530"]);
  });

  it("splits a hyphenated date, as documented", () => {
    expect(numericTokens("signed 2026-07-24")).toEqual(["2026", "07", "24"]);
  });

  it("finds nothing in text that carries no numbers", () => {
    expect(numericTokens("no figures on this page")).toEqual([]);
  });
});

describe("numeric accuracy, where 1 is perfect", () => {
  it("scores every figure surviving as perfect", () => {
    expect(numericAccuracy("3 depots, 8 weeks, 1,284,530 parcels", "3 depots, 8 weeks, 1,284,530 parcels")).toBe(1);
  });

  it("forgives a dropped thousands separator, because no value changed", () => {
    expect(numericAccuracy("1,284,530", "1284530")).toBe(1);
  });

  it("reports total loss when a long figure loses one digit", () => {
    // The failure this whole metric exists for. One character wrong out of fifteen, and the
    // number that reaches the reader is off by a factor of ten.
    const expected = "Total 1,284,530";
    const actual = "Total 1,284,53";
    expect(numericAccuracy(expected, actual)).toBe(0);
    // And the general metric barely notices, which is the argument for measuring both.
    expect(characterErrorRate(expected, actual)).toBeCloseTo(1 / 15, 10);
    expect(characterErrorRate(expected, actual)).toBeLessThan(0.07);
  });

  it("reports total loss when two digits are transposed", () => {
    expect(numericAccuracy("1,284,530", "1,284,503")).toBe(0);
  });

  it("does not treat a decimal point as a separator", () => {
    // Removing the period as though it were a grouping mark would make these equal.
    expect(numericAccuracy("3.14", "314")).toBe(0);
  });

  it("counts each expected figure once, so a repeated number is not covered twice", () => {
    expect(numericAccuracy("12 depots and 12 vans", "12 depots and no vans")).toBe(1 / 2);
  });

  it("scores a page with no numbers as 1, which the token count is there to qualify", () => {
    expect(numericAccuracy("no figures at all", "no figures at all")).toBe(1);
    expect(scoreAll("no figures at all", "no figures at all").expectedNumericTokens).toBe(0);
  });

  it("scores nothing read as nothing survived", () => {
    expect(numericAccuracy("1,284,530", "")).toBe(0);
  });

  it("is blind to invented figures, as its comment says", () => {
    // Recall only. Documented, and asserted so the day someone changes it, this fails loudly.
    expect(numericAccuracy("42", "42 and also 99999 and 12345")).toBe(1);
  });
});

describe("reading order fidelity, where 1 is perfect", () => {
  const page = "alpha line\nbeta line\ngamma line";

  it("scores text read in the same order as perfect", () => {
    expect(readingOrderFidelity(page, page)).toBe(1);
  });

  it("survives recognition noise inside a line, because that is the other metric's job", () => {
    expect(readingOrderFidelity(page, "a1pha line\nbeta line\ngamma line")).toBe(1);
  });

  it("collapses when two lines are transposed", () => {
    // Of the two adjacent pairs, alpha before beta and beta before gamma, neither survives.
    expect(readingOrderFidelity(page, "beta line\nalpha line\ngamma line")).toBe(0);
  });

  it("scores a partial reordering in proportion", () => {
    // Four lines, three adjacent pairs. Swapping the last two leaves only the first pair intact.
    const four = "one\ntwo\nthree\nfour";
    expect(readingOrderFidelity(four, "one\ntwo\nfour\nthree")).toBeCloseTo(1 / 3, 10);
  });

  it("catches a two column page read straight across, which the error rates barely notice", () => {
    const columns = "left one\nleft two\nleft three\nright one\nright two\nright three";
    const flattened = "left one\nright one\nleft two\nright two\nleft three\nright three";
    expect(readingOrderFidelity(columns, flattened)).toBe(0);
    // Every word is present, so the word rate is far from reporting a broken page.
    expect(wordErrorRate(columns, flattened)).toBeLessThan(1);
  });

  it("stays high when columns are merged instead of resequenced, which the error rate catches", () => {
    // The blindness named in the comment, asserted so it stays a known one. An engine that returns
    // each pair of side by side lines as a single line preserves the sequence of the lines it
    // returns, so only the pair that spans the column break is lost.
    // Each of the six expected lines pairs to the merged line that contains it, giving the
    // sequence 0, 1, 2, 0, 1, 2. Four of the five adjacent pairs step by one, and only the pair
    // that spans the column break does not.
    const columns = "alpha one\nalpha two\nalpha six\nbravo one\nbravo two\nbravo six";
    const merged = "alpha one bravo one\nalpha two bravo two\nalpha six bravo six";
    expect(readingOrderFidelity(columns, merged)).toBeCloseTo(4 / 5, 10);
    expect(characterErrorRate(columns, merged)).toBeGreaterThan(0.2);
  });

  it("has nothing to judge on a single line, and says so with 1", () => {
    expect(readingOrderFidelity("only one line", "only one line")).toBe(1);
    expect(readingOrderFidelity("", "")).toBe(1);
  });

  it("scores nothing read as 0", () => {
    expect(readingOrderFidelity(page, "")).toBe(0);
  });
});

describe("scoring a reading every way at once", () => {
  it("returns a perfect row for a perfect reading", () => {
    const text = "Depot rollout\n3 sites, 1,284,530 parcels a year";
    expect(scoreAll(text, text)).toEqual({
      characterErrorRate: 0,
      wordErrorRate: 0,
      numericAccuracy: 1,
      readingOrderFidelity: 1,
      // "3" and "1,284,530".
      expectedNumericTokens: 2,
    });
  });

  it("reports the four scores independently, so one cannot hide behind another", () => {
    const expectedText = "Depot rollout\n3 sites, 1,284,530 parcels a year";
    const actualText = "3 sites, 1,284,53 parcels a year\nDepot rollout";
    const scores = scoreAll(expectedText, actualText);
    expect(scores.numericAccuracy).toBeLessThan(1);
    expect(scores.readingOrderFidelity).toBe(0);
    expect(scores.characterErrorRate).toBeGreaterThan(0);
    expect(scores.expectedNumericTokens).toBe(2);
  });
});

describe("the shape the scores are defined over", () => {
  it("drops blank lines so a page break does not read as a missing line", () => {
    expect(textLines("one\n\n\ntwo")).toEqual(["one", "two"]);
    expect(textLines("   ")).toEqual([]);
  });
});
