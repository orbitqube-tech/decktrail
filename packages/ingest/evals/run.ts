import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extract } from "../src/index.js";
import { PaddleUnavailableError, paddleOcrImages } from "../src/engines/paddle.js";
import { tesseractEngine } from "../src/engines/tesseract.js";
import type { ExtractOptions, OcrEngine, OcrTier } from "../src/types.js";
import { DEFAULT_CORPUS_DIR, MANIFEST_FILENAME, CORPUS_FORMAT_VERSION } from "./generate-corpus.js";
import type { CorpusManifest } from "./generate-corpus.js";
import { scoreAll } from "./metrics.js";
import type { MetricScores } from "./metrics.js";

/**
 * Read every page of the generated corpus with every engine at every model tier, score each
 * reading four ways, and print and record the result.
 *
 * This runner measures. It does not judge, and it deliberately contains no threshold of any kind:
 * no floor a run has to clear, no exit code that means "good enough". A threshold here would be a
 * number invented by whoever wrote the harness, and the entire reason this directory exists is
 * that the numbers deciding behaviour in this package have to come from a measurement and have to
 * name the run they came from. A scorecard is that run: it is written to disk, with the corpus it
 * used, the machine it ran on, and the exact engine string every row reported.
 *
 * When it cannot measure, it says what is missing and stops. A harness that prints a table of
 * zeroes because the corpus was never generated is worse than one that refuses.
 */

/**
 * The version of the scorecard file below.
 *
 * Written into every file so that a comparison between two runs can refuse rather than quietly
 * line up columns that no longer mean the same thing.
 */
export const SCORECARD_FORMAT_VERSION = 1;

/**
 * One engine to measure: what to call it, and how to reach it.
 *
 * An engine with no implementation is the pipeline's own choice, which is worth a row of its own
 * because it is what an author actually gets. The named ones are reached directly, so that a
 * comparison between two engines is a comparison rather than a race with the fallback rules.
 */
export interface EngineChoice {
  /** What the sweep calls it. The engine string a reading reports for itself is recorded separately. */
  name: string;
  /** Absent means let the package pick, which is the path a real ingestion takes. */
  impl?: OcrEngine;
}

/**
 * Every engine this sweep can ask for.
 *
 * Both adapters are named explicitly rather than measured only through the pipeline, because the
 * pipeline prefers one and falls back to the other, so a sweep of the pipeline alone could never
 * say what the difference between them is. That difference is the whole question: one is optional
 * and reads a bad scan better, the other is always installed. Nobody should be arguing about it
 * from memory.
 */
export const ENGINES: readonly EngineChoice[] = [
  { name: "auto" },
  { name: "paddle", impl: paddleOcrImages },
  { name: "tesseract", impl: tesseractEngine },
];

/**
 * The tiers swept when none are named on the command line.
 *
 * Every tier the ingestion contract knows about, because the point of the sweep is to find out
 * what each one costs and buys, and leaving one out of the default would be assuming the answer.
 * An engine that carries one model per language accepts a tier and ignores it, so its rows are
 * identical across tiers. That is a measurement too, and a cheap way to confirm it really does
 * ignore them.
 */
export const DEFAULT_TIERS: readonly OcrTier[] = ["auto", "tiny", "small", "medium", "server"];

/**
 * How many decimal places the printed table shows.
 *
 * Three. Finer than any difference this corpus can honestly resolve, and coarse enough that the
 * columns line up and a person can read down them.
 */
export const SCORE_DECIMALS = 3;

/**
 * Column widths for the printed table, in characters.
 *
 * Presentation only, and here as named values rather than scattered through the format string, so
 * that widening a column is one edit and the header cannot drift out of step with the rows.
 */
export const COLUMN_WIDTHS = {
  case: 18,
  asked: 10,
  tier: 7,
  engine: 30,
  score: 9,
  seconds: 8,
} as const;

/** Where scorecards are written unless told otherwise. Under `tmp`, which the repository ignores. */
export const DEFAULT_SCORECARD_DIR = path.resolve(DEFAULT_CORPUS_DIR, "..", "scorecards");

/** The file name that always holds the most recent run, for a quick look without hunting a timestamp. */
export const LATEST_SCORECARD_FILENAME = "scorecard-latest.json";

/** One case read by one engine at one tier. */
export interface ScorecardRow {
  caseId: string;
  /** The machine readable label of the failure the page was built to provoke. */
  catches: string;
  /** Which entry of the sweep this row came from, which is not the same thing as what ran. */
  engineRequested: string;
  /** The tier that was asked for. */
  tierRequested: OcrTier;
  /**
   * The engine string the result reported, exactly as it reported it. Null when the extraction
   * named no engine at all, which makes the row unreproducible and is called out rather than
   * filled in with a guess.
   */
  engineReported: string | null;
  /** Mean confidence the result reported, or null when it reported none. */
  confidenceReported: number | null;
  /** The warning codes raised, which is how a fallback or a truncation shows up in the record. */
  warningCodes: string[];
  /** Wall clock time for the extraction alone, not the scoring. */
  durationMs: number;
  scores: MetricScores | null;
  /**
   * The text that was actually read.
   *
   * Kept because a score on its own is undiagnosable: a number that moved between two runs tells
   * you something changed and nothing about what, and the pages here are small enough that
   * carrying the reading costs a few kilobytes. It is also the only way to see which of the two
   * ways a column layout can fail happened, since one of them barely moves the order score.
   */
  textReturned: string;
  /** The message of whatever went wrong, when something did. Null on a row that produced a reading. */
  failure: string | null;
}

/** One run of the whole sweep, written as JSON so a later run can be held up against it. */
export interface Scorecard {
  formatVersion: number;
  measuredAt: string;
  /** Recognition depends on the engine build, so the runtime and the machine are part of the result. */
  environment: { node: string; platform: string; arch: string };
  /** Which corpus was read, since a scorecard against a different corpus is a different experiment. */
  corpus: {
    directory: string;
    formatVersion: number;
    generatedAt: string;
    dpi: number;
    fontFamilyRequested: string;
    caseCount: number;
  };
  enginesRequested: string[];
  /** Engines that were asked for and could not run here, each with the reason it gave. */
  enginesUnavailable: { name: string; reason: string }[];
  tiersRequested: OcrTier[];
  rows: ScorecardRow[];
}

/** `--name=value` from the command line, or null when it was not given. Never a silent default. */
function flag(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const found = argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/** The same, for a comma separated list. Null when the argument was not given at all. */
function listFlag(argv: readonly string[], name: string): string[] | null {
  const raw = flag(argv, name);
  if (raw === null) return null;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * The tiers to sweep.
 *
 * A name that is not a tier stops the run. Quietly dropping it would produce a scorecard missing
 * rows that the person who typed it believes are there.
 */
function tiersFromArgv(argv: readonly string[]): OcrTier[] {
  const names = listFlag(argv, "tiers");
  if (names === null) return [...DEFAULT_TIERS];
  const known: readonly string[] = DEFAULT_TIERS;
  const unknown = names.filter((n) => !known.includes(n));
  if (unknown.length > 0) {
    throw new Error(`not a model tier: ${unknown.join(", ")}. Known tiers are ${DEFAULT_TIERS.join(", ")}.`);
  }
  return names as OcrTier[];
}

/** The engines to sweep, with the same refusal to quietly drop a name that is not one. */
function enginesFromArgv(argv: readonly string[]): EngineChoice[] {
  const names = listFlag(argv, "engines");
  if (names === null) return [...ENGINES];
  return names.map((name) => {
    const engine = ENGINES.find((e) => e.name === name);
    if (!engine) {
      throw new Error(
        `not an engine this harness knows: ${name}. Known engines are ${ENGINES.map((e) => e.name).join(", ")}.`,
      );
    }
    return engine;
  });
}

/**
 * Load the corpus index, or explain precisely what to run.
 *
 * The two failures are told apart because the fixes differ: no corpus at all means generate one,
 * while a corpus of the wrong format means the cases have changed underneath it and the images on
 * disk no longer match the ground truth the current code would produce.
 */
async function loadManifest(corpusDir: string): Promise<CorpusManifest> {
  const manifestPath = path.join(corpusDir, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error(
      `no corpus found at ${corpusDir}. Nothing has been measured.\n` +
        "Generate it first, from the repository root:\n" +
        "  pnpm exec tsx packages/ingest/evals/generate-corpus.ts",
    );
  }

  const manifest = JSON.parse(raw) as CorpusManifest;
  if (manifest.formatVersion !== CORPUS_FORMAT_VERSION) {
    throw new Error(
      `the corpus at ${corpusDir} is format ${manifest.formatVersion} and this harness draws format ` +
        `${CORPUS_FORMAT_VERSION}. The images no longer match the ground truth the cases would produce, ` +
        "so nothing has been measured. Regenerate it:\n" +
        "  pnpm exec tsx packages/ingest/evals/generate-corpus.ts",
    );
  }
  return manifest;
}

function fixed(value: number): string {
  return value.toFixed(SCORE_DECIMALS);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width);
}

/** The header the rows are printed under. Built from the same widths, so it cannot drift. */
function headerLine(): string {
  return [
    pad("case", COLUMN_WIDTHS.case),
    pad("asked", COLUMN_WIDTHS.asked),
    pad("tier", COLUMN_WIDTHS.tier),
    pad("engine that ran", COLUMN_WIDTHS.engine),
    pad("char err", COLUMN_WIDTHS.score),
    pad("word err", COLUMN_WIDTHS.score),
    pad("numeric", COLUMN_WIDTHS.score),
    pad("order", COLUMN_WIDTHS.score),
    pad("seconds", COLUMN_WIDTHS.seconds),
  ].join(" ");
}

function rowLine(row: ScorecardRow): string {
  const cells = [
    pad(row.caseId, COLUMN_WIDTHS.case),
    pad(row.engineRequested, COLUMN_WIDTHS.asked),
    pad(row.tierRequested, COLUMN_WIDTHS.tier),
    pad(row.engineReported ?? "(unnamed)", COLUMN_WIDTHS.engine),
  ];
  if (row.scores === null) {
    cells.push(pad(`failed: ${row.failure ?? "for a reason it did not give"}`, COLUMN_WIDTHS.score * 4 + 3));
  } else {
    cells.push(
      pad(fixed(row.scores.characterErrorRate), COLUMN_WIDTHS.score),
      pad(fixed(row.scores.wordErrorRate), COLUMN_WIDTHS.score),
      pad(fixed(row.scores.numericAccuracy), COLUMN_WIDTHS.score),
      pad(fixed(row.scores.readingOrderFidelity), COLUMN_WIDTHS.score),
    );
  }
  cells.push(pad(fixed(row.durationMs / 1000), COLUMN_WIDTHS.seconds));
  return cells.join(" ");
}

/**
 * The mean of each score across the pages that produced a reading, one line per engine and tier.
 *
 * Failed rows are excluded from the mean and counted separately, because averaging a failure in as
 * a zero would make an engine that crashed on half the corpus look merely mediocre.
 */
function summarize(rows: readonly ScorecardRow[]): string[] {
  const groups = [...new Set(rows.map((r) => `${r.engineRequested} ${r.tierRequested}`))];
  return groups.map((key) => {
    const [engineRequested = "", tierRequested = ""] = key.split(" ");
    const inGroup = rows.filter((r) => r.engineRequested === engineRequested && r.tierRequested === tierRequested);
    const scored = inGroup.flatMap((r) => (r.scores === null ? [] : [r.scores]));
    const label = `${pad(engineRequested, COLUMN_WIDTHS.asked)} ${pad(tierRequested, COLUMN_WIDTHS.tier)}`;
    if (scored.length === 0) return `${label} no readings, ${inGroup.length} failed`;

    const mean = (pick: (s: MetricScores) => number): string =>
      fixed(scored.reduce((sum, s) => sum + pick(s), 0) / scored.length);
    return [
      label,
      pad(`${scored.length}/${inGroup.length} read`, COLUMN_WIDTHS.engine),
      pad(mean((s) => s.characterErrorRate), COLUMN_WIDTHS.score),
      pad(mean((s) => s.wordErrorRate), COLUMN_WIDTHS.score),
      pad(mean((s) => s.numericAccuracy), COLUMN_WIDTHS.score),
      pad(mean((s) => s.readingOrderFidelity), COLUMN_WIDTHS.score),
    ].join(" ");
  });
}

/** Everything one reading needs that is not the page itself. */
interface MeasureContext {
  engine: EngineChoice;
  tier: OcrTier;
  /** Passed straight to `extract`, and only when the command line gave them. */
  extras: { languages?: string[]; modelPath?: string };
}

/**
 * Read one page with one engine at one tier, and score it.
 *
 * Recognition is forced rather than left to the automatic decision. Every page in this corpus is
 * an image, so the automatic path would reach the same place, but an eval that leans on a decision
 * it is not measuring is an eval that changes meaning the day that decision changes.
 */
async function measure(
  imageBytes: Uint8Array,
  truth: string,
  page: { id: string; catches: string },
  context: MeasureContext,
): Promise<ScorecardRow> {
  const options: ExtractOptions = {
    filename: `${page.id}.png`,
    ocr: "force",
    tier: context.tier,
    ...context.extras,
    // Progress goes to the error stream so the scorecard on the output stream stays a clean table.
    onProgress: (message: string) =>
      process.stderr.write(`  ${page.id} ${context.engine.name} ${context.tier}: ${message}\n`),
  };
  // Left unset for the automatic entry, so that row measures what an author actually gets.
  if (context.engine.impl) options.ocrImpl = context.engine.impl;

  const startedAt = performance.now();
  const result = await extract(imageBytes, options);
  const durationMs = performance.now() - startedAt;

  return {
    caseId: page.id,
    catches: page.catches,
    engineRequested: context.engine.name,
    tierRequested: context.tier,
    // An engine that did not name itself is recorded as null and shown as unnamed. The row is then
    // a measurement nobody can reproduce, and that has to be visible rather than papered over.
    engineReported: result.engine ? result.engine : null,
    confidenceReported: result.confidence ?? null,
    warningCodes: result.warnings.map((w) => w.code),
    durationMs,
    scores: scoreAll(truth, result.text),
    textReturned: result.text,
    failure: null,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const corpusDir = path.resolve(flag(argv, "corpus") ?? DEFAULT_CORPUS_DIR);
  const outputDir = path.resolve(flag(argv, "out") ?? DEFAULT_SCORECARD_DIR);
  const tiers = tiersFromArgv(argv);
  const engines = enginesFromArgv(argv);

  // Passed through only when given. Guessing a language, or inventing a model directory, would
  // make a run that is not the run the person asked for.
  const languages = listFlag(argv, "languages");
  const modelPath = flag(argv, "model-path");
  const extras: { languages?: string[]; modelPath?: string } = {};
  if (languages !== null) extras.languages = languages;
  if (modelPath !== null) extras.modelPath = path.resolve(modelPath);

  const manifest = await loadManifest(corpusDir);

  const rows: ScorecardRow[] = [];
  const unavailable = new Map<string, string>();

  console.log(headerLine());
  for (const entry of manifest.cases) {
    const imageBytes = await readFile(path.join(corpusDir, entry.image));
    const truth = await readFile(path.join(corpusDir, entry.truth), "utf8");
    for (const engine of engines) {
      if (unavailable.has(engine.name)) continue;
      for (const tier of tiers) {
        try {
          const row = await measure(imageBytes, truth, entry, { engine, tier, extras });
          rows.push(row);
          console.log(rowLine(row));
        } catch (error: unknown) {
          // An engine whose optional package is not installed has not failed a measurement, it has
          // reported that the measurement cannot be taken on this machine. Name it once and drop
          // it from the sweep, rather than filling the table with one identical failure per page.
          if (error instanceof PaddleUnavailableError) {
            unavailable.set(engine.name, error.message);
            console.log(`skipping the ${engine.name} engine on this machine: ${error.message}`);
            break;
          }
          const message = error instanceof Error ? error.message : String(error);
          const failed: ScorecardRow = {
            caseId: entry.id,
            catches: entry.catches,
            engineRequested: engine.name,
            tierRequested: tier,
            engineReported: null,
            confidenceReported: null,
            warningCodes: [],
            durationMs: 0,
            scores: null,
            textReturned: "",
            failure: message,
          };
          rows.push(failed);
          console.log(rowLine(failed));
        }
      }
    }
  }

  // Nothing read by anything is not a scorecard. Say what stopped it, and write no file that a
  // later run could mistake for a measurement.
  if (!rows.some((r) => r.scores !== null)) {
    const reasons = [
      ...[...unavailable].map(([name, reason]) => `${name}: ${reason}`),
      ...rows.flatMap((r) => (r.failure === null ? [] : [`${r.engineRequested}: ${r.failure}`])),
    ];
    throw new Error(
      "no page was read by any engine, so nothing has been measured.\n" +
        (reasons.length > 0 ? `${[...new Set(reasons)].join("\n")}\n` : "") +
        "If a package is missing, install this package's dependencies from the repository root with " +
        "pnpm install. If an engine fetches its models on first use, that first run needs the " +
        "network, or a local model directory passed as --model-path=<dir>.",
    );
  }

  console.log("");
  console.log(`mean per engine and tier, over the pages that produced a reading (${manifest.cases.length} in the corpus)`);
  for (const line of summarize(rows)) console.log(line);

  const scorecard: Scorecard = {
    formatVersion: SCORECARD_FORMAT_VERSION,
    measuredAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    corpus: {
      directory: corpusDir,
      formatVersion: manifest.formatVersion,
      generatedAt: manifest.generatedAt,
      dpi: manifest.dpi,
      fontFamilyRequested: manifest.fontFamilyRequested,
      caseCount: manifest.cases.length,
    },
    enginesRequested: engines.map((e) => e.name),
    enginesUnavailable: [...unavailable].map(([name, reason]) => ({ name, reason })),
    tiersRequested: tiers,
    rows,
  };

  await mkdir(outputDir, { recursive: true });
  const stamped = `scorecard-${scorecard.measuredAt.replace(/[:.]/g, "-")}.json`;
  const body = `${JSON.stringify(scorecard, null, 2)}\n`;
  await writeFile(path.join(outputDir, stamped), body, "utf8");
  await writeFile(path.join(outputDir, LATEST_SCORECARD_FILENAME), body, "utf8");

  console.log("");
  console.log(`written to ${path.join(outputDir, stamped)}`);
  console.log(`and to ${path.join(outputDir, LATEST_SCORECARD_FILENAME)}`);
  console.log(
    "these are measurements, not a verdict. The corpus is synthesized, so use it to compare one " +
      "engine or tier against another on this machine, and cite the scorecard file whenever a " +
      "number from it is used to set anything.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
