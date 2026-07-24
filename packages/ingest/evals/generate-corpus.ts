import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { numericTokens } from "./metrics.js";

/**
 * Build the reference corpus the scorecard is measured against.
 *
 * The corpus is generated rather than committed, for two reasons and both are hard rules here.
 * Binary fixtures do not belong in this repository, and a hand-transcribed ground truth is
 * itself a source of error: the moment somebody types out what they think the picture says, the
 * measurement is against one person's reading rather than against the page. Here the drawing and
 * the ground truth come from the same array of strings, so the truth cannot drift from the image.
 *
 * The cases are deliberately unpleasant. A corpus of clean, large, high contrast text produces
 * flattering numbers and thresholds that fall apart on the first real scan, so each case below
 * reproduces one specific thing that is known to break recognition, and carries a machine
 * readable label saying which.
 *
 * What this cannot do, and the README says it again: synthesized pages are not documents. They
 * have no scanner noise, no JPEG artefacts, no coffee stain, no bleed from the reverse side, no
 * stamp across the total. Use this to compare one engine or tier against another on the same
 * machine. Do not set an accuracy threshold from it alone.
 */

/**
 * The version of the corpus layout and manifest below.
 *
 * A scorecard records it, so two runs measured against differently drawn pages can never be
 * compared as though they were the same experiment. Bump it whenever a case changes what it
 * draws.
 */
export const CORPUS_FORMAT_VERSION = 1;

/**
 * The resolution the pages are drawn at, in dots per inch.
 *
 * 150 is the usual default of an office scanner and of a phone document scan, so it is the
 * resolution a real ingested page most often arrives at. Drawing at 300 would make every score
 * better and none of them more representative.
 */
export const CORPUS_PAGE_DPI = 150;

/** A4 is 8.27 by 11.69 inches, which at the DPI above is this many pixels. */
export const PAGE_WIDTH_PX = Math.round(8.27 * CORPUS_PAGE_DPI);
export const PAGE_HEIGHT_PX = Math.round(11.69 * CORPUS_PAGE_DPI);

/** A 15 mm margin, the common default of a word processor, converted at the DPI above. */
export const PAGE_MARGIN_PX = Math.round((15 / 25.4) * CORPUS_PAGE_DPI);

/**
 * The font asked for.
 *
 * A generic family rather than a named face, because this repository ships no font files for
 * drawing with and naming a face that is not installed would silently fall back to something
 * else. The consequence is that the resolved face is whatever the machine's default sans is, so
 * two scorecards are only comparable when they were produced on the same machine. The manifest
 * records the request so at least the request is not in doubt.
 */
export const CORPUS_FONT_FAMILY = "sans-serif";

/** Body text at about 14 points, which is comfortable and is the easy baseline. */
export const BASELINE_FONT_PX = Math.round((14 / 72) * CORPUS_PAGE_DPI);

/**
 * About 7 points: smaller than the body of any printed report and around the size of a footnote
 * or a dense table. This is where character shapes start to collide at scanner resolution.
 */
export const DENSE_FONT_PX = Math.round((7 / 72) * CORPUS_PAGE_DPI);

/** Two columns of about 11 points, the usual size of a two column layout. */
export const COLUMN_FONT_PX = Math.round((11 / 72) * CORPUS_PAGE_DPI);

/** Ordinary leading: line height as a multiple of the font size. */
export const LINE_HEIGHT_RATIO = 1.45;

/** Leading for the dense case. Lines this close together let ascenders and descenders touch. */
export const DENSE_LINE_HEIGHT_RATIO = 1.15;

/** The gutter between columns, wide enough to be a real gutter and narrow enough to be ambiguous. */
export const COLUMN_GAP_PX = 60;

export const PAPER_COLOUR = "#ffffff";
export const INK_COLOUR = "#111111";

/**
 * A faded photocopy: grey ink on grey paper, a contrast ratio of about 2.2 to 1.
 *
 * For comparison, the Web Content Accessibility Guidelines (WCAG) ask for at least 4.5 to 1 for
 * body text, so this is well under half of what a person is considered able to read comfortably,
 * and it is entirely ordinary in a document that has been printed, signed, and scanned back.
 */
export const LOW_CONTRAST_PAPER = "#d0d0d0";
export const LOW_CONTRAST_INK = "#8a8a8a";

/**
 * How far the skewed page is rotated, in degrees.
 *
 * A page fed by hand into a scanner, or photographed on a desk, is rarely more than a few degrees
 * out. Three degrees is enough to lift the right hand end of a line most of a line height above
 * its left hand end on a wide page, which is what breaks naive grouping of characters into rows,
 * and it is small enough that a person would call the scan fine.
 */
export const SKEW_DEGREES = 3;

/**
 * Where the corpus is written unless told otherwise.
 *
 * Under a directory named `tmp`, which the repository's .gitignore already excludes at any depth.
 * That is not a convenience: images and their ground truth are generated output, and generated
 * output that can be committed eventually is.
 */
export const DEFAULT_CORPUS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "tmp/corpus");

/**
 * One page to draw.
 *
 * Content is rows of cells rather than lines of text so that a table and a paragraph are the same
 * kind of thing: a paragraph is simply rows of one cell each. That matters because the ground
 * truth is derived from this array, so there is exactly one description of what is on the page.
 */
export interface CorpusCase {
  /** File name stem, and the row label on the scorecard. */
  id: string;
  /** Machine readable label for the failure this page is built to provoke. */
  catches: string;
  /** Why that failure is worth a page of its own. */
  why: string;
  /** One entry per column, each a list of rows, each row a list of cells. */
  columns: string[][][];
  fontPx: number;
  lineHeightRatio: number;
  ink: string;
  paper: string;
  /** Rotation of the drawn content about the centre of the page. */
  skewDegrees: number;
}

/** Prose that reads like an ordinary consulting page, with no names in it and nothing private. */
const PROSE: string[] = [
  "Depot consolidation review",
  "",
  "The pilot covers three regional depots and runs for eight weeks.",
  "Each depot keeps its existing routing while the new schedule is",
  "measured alongside it, so the comparison is against the depot's",
  "own performance rather than against a regional average.",
  "",
  "Two things decide whether the pilot continues. The first is the",
  "cost per parcel, which must fall by at least 4 percent against",
  "the same eight weeks last year. The second is the proportion of",
  "deliveries made inside the promised window, which must not fall",
  "at all. A saving bought with a worse service is not a saving.",
  "",
  "The review reports on 24 March, with a written recommendation",
  "and the underlying figures for each depot.",
];

/** The same argument set much smaller and much tighter, which is where shapes start to collide. */
const DENSE_PROSE: string[] = [
  "Appendix B: assumptions behind the depot consolidation model",
  "",
  "1. Volumes are taken from the twelve months to 31 December and are not seasonally adjusted. Adjusting them would",
  "   improve the fit of the model and would hide the peak that the depots actually have to staff for.",
  "2. Vehicle costs are per kilometre and include fuel, maintenance and the amortised cost of the vehicle itself.",
  "   They exclude the driver, who is costed per hour in the following section because overtime does not scale with",
  "   distance and treating it as though it did was the largest error in the previous model.",
  "3. The cost per parcel of 1.87 is a blended figure across all three depots. Individual depots range from 1.42 to",
  "   2.31, and the spread matters more than the average when deciding which depot to consolidate into which.",
  "4. Property costs are held flat. A depot that closes is assumed to be sublet rather than sold, at 60 percent of",
  "   its current cost, for the remaining 42 months of its lease.",
  "5. Headcount is modelled as 118 full time equivalents, unchanged, on the assumption that consolidation moves work",
  "   between sites rather than removing it. Any saving from reduced headcount is deliberately excluded here and is",
  "   modelled separately in Appendix C, because it is the assumption most likely to be challenged.",
  "6. No revenue effect is modelled. The pilot is measured on cost and on service, and any change in volume during",
  "   the eight weeks is treated as noise unless it exceeds 5 percent, at which point the pilot is paused and the",
  "   cause established before the measurement continues.",
  "7. Figures are in pounds and are rounded to the nearest whole unit in the tables and held unrounded in the model.",
];

/**
 * A table of money and dates.
 *
 * The seven digit figures are the point of it. A number that long can lose a digit to a single
 * misread character and still look entirely plausible on the page, which is the failure the
 * numeric metric exists to catch and the one a character error rate reports as a rounding error.
 */
const NUMBER_TABLE: string[][] = [
  ["Depot", "Parcels", "Cost", "Change", "Reviewed"],
  ["North", "1,284,530", "2,401,118.40", "-4.2%", "2026-03-24"],
  ["Central", "4,096,118", "7,655,004.75", "-1.8%", "2026-03-25"],
  ["South", "938,472", "1,760,930.05", "+0.9%", "2026-03-26"],
  ["West", "2,507,861", "4,689,203.60", "-6.4%", "2026-03-27"],
  ["East", "1,110,007", "2,077,713.15", "-0.3%", "2026-03-28"],
  ["Total", "9,936,988", "18,583,969.95", "-2.7%", "2026-03-31"],
];

/** The left column of the two column page. It is a complete argument on its own. */
const LEFT_COLUMN: string[] = [
  "Why consolidate at all",
  "",
  "Three depots inside forty",
  "kilometres of each other",
  "duplicate every fixed cost",
  "they have. Each carries its",
  "own shift supervisor, its",
  "own loading bays and its own",
  "spare vehicles, and none of",
  "the three runs at more than",
  "seventy percent of the",
  "throughput it was built for.",
  "The duplication is the whole",
  "of the saving on offer.",
];

/**
 * The right column. It continues the argument, so a run that interleaves the two columns produces
 * text that is grammatical, plausible, and about nothing.
 */
const RIGHT_COLUMN: string[] = [
  "Why it might still be wrong",
  "",
  "A single larger depot has a",
  "single larger failure. The",
  "three sites currently cover",
  "for each other on a bad day,",
  "and that cover is invisible",
  "in the cost model because",
  "nobody bills for it.",
  "Consolidation also lengthens",
  "the average final leg, which",
  "is the part of the journey",
  "that costs the most and is",
  "the least predictable.",
];

/** One row per line of prose, so a paragraph and a table are the same shape to the drawing code. */
function asRows(lines: readonly string[]): string[][] {
  return lines.map((line) => [line]);
}

/**
 * Every page in the corpus.
 *
 * Six cases, each isolating one variable. Isolating them is the point: a page that is small and
 * skewed and faded tells you only that recognition failed, while these tell you which of the
 * three it failed on.
 */
export const CORPUS_CASES: readonly CorpusCase[] = [
  {
    id: "clean-prose",
    catches: "clean-baseline",
    why: "The easy case. If this one is not close to perfect, nothing measured on the harder pages means anything.",
    columns: [asRows(PROSE)],
    fontPx: BASELINE_FONT_PX,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ink: INK_COLOUR,
    paper: PAPER_COLOUR,
    skewDegrees: 0,
  },
  {
    id: "dense-small-text",
    catches: "small-dense-text",
    why: "Footnote sized text with tight leading, where character shapes collide and lines run into each other.",
    columns: [asRows(DENSE_PROSE)],
    fontPx: DENSE_FONT_PX,
    lineHeightRatio: DENSE_LINE_HEIGHT_RATIO,
    ink: INK_COLOUR,
    paper: PAPER_COLOUR,
    skewDegrees: 0,
  },
  {
    id: "number-table",
    catches: "long-numeric-figures",
    why: "Seven digit figures, decimals, signed percentages and dates. A lost digit here is a plausible wrong answer.",
    columns: [NUMBER_TABLE],
    fontPx: BASELINE_FONT_PX,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ink: INK_COLOUR,
    paper: PAPER_COLOUR,
    skewDegrees: 0,
  },
  {
    id: "two-column",
    catches: "multi-column-reading-order",
    why: "Two columns whose halves continue each other, so reading straight across the page produces fluent nonsense.",
    columns: [asRows(LEFT_COLUMN), asRows(RIGHT_COLUMN)],
    fontPx: COLUMN_FONT_PX,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ink: INK_COLOUR,
    paper: PAPER_COLOUR,
    skewDegrees: 0,
  },
  {
    id: "low-contrast",
    catches: "low-contrast-ink",
    why: "A faded photocopy. Thresholding is the first thing any engine does, and this is where it gives up.",
    columns: [asRows(PROSE)],
    fontPx: BASELINE_FONT_PX,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ink: LOW_CONTRAST_INK,
    paper: LOW_CONTRAST_PAPER,
    skewDegrees: 0,
  },
  {
    id: "skewed-page",
    catches: "page-skew",
    why: "A few degrees of rotation, which is the ordinary state of a scan and breaks grouping of characters into rows.",
    columns: [asRows(PROSE)],
    fontPx: BASELINE_FONT_PX,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ink: INK_COLOUR,
    paper: PAPER_COLOUR,
    skewDegrees: SKEW_DEGREES,
  },
];

/**
 * What the page says, derived from the same rows that get drawn.
 *
 * Columns are concatenated in reading order, first column first, which is how a person reads the
 * page and therefore what a correct extraction has to produce. Cells within a row are joined by a
 * single space because this package returns words rather than layout: whatever the gap looked
 * like on the page, the extraction is expected to bring the cells back on one line in order.
 *
 * Blank rows are dropped, since the scoring functions ignore blank lines anyway and leaving them
 * in would suggest they were being measured.
 */
export function groundTruthFor(page: CorpusCase): string {
  return page.columns
    .flatMap((column) => column.map((row) => row.join(" ").trim()))
    .filter((line) => line !== "")
    .join("\n");
}

/** The minimum a drawing surface has to offer. Kept local so the optional package stays optional. */
interface CorpusContext {
  fillStyle: string;
  font: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}

interface CorpusCanvas {
  getContext(kind: "2d"): CorpusContext;
  encode(format: "png"): Promise<Buffer>;
}

/**
 * Load the drawing library.
 *
 * The canvas package is an optional dependency of this package, so it may simply not be here, and
 * a module resolution stack trace is a poor way to tell somebody that. This mirrors how the PDF
 * rasteriser reports the same absence: name the package, say what it was for, say what to do.
 */
async function loadCanvasFactory(): Promise<(w: number, h: number) => CorpusCanvas> {
  try {
    const canvas = (await import("@napi-rs/canvas")) as unknown as {
      createCanvas: (w: number, h: number) => CorpusCanvas;
    };
    return canvas.createCanvas;
  } catch {
    throw new Error(
      "generating the evaluation corpus needs the optional @napi-rs/canvas package to draw its " +
        "pages. Install it, or skip the corpus and the scorecard entirely.",
    );
  }
}

/**
 * Draw one page.
 *
 * The paper is filled before any rotation and the content is rotated inside it, which is what a
 * skewed scan actually looks like: the sheet fills the frame and the printing sits crooked on it.
 * Rotating the paper as well would leave blank corners that no scanner produces.
 *
 * If the content does not fit the page it throws rather than drawing off the bottom edge. Text
 * silently missing from an image whose ground truth still claims it would show up as a
 * catastrophic score with no obvious cause, and a corpus that lies is worse than no corpus.
 */
export async function drawCase(page: CorpusCase, createCanvas: (w: number, h: number) => CorpusCanvas): Promise<Uint8Array> {
  const canvas = createCanvas(PAGE_WIDTH_PX, PAGE_HEIGHT_PX);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = page.paper;
  ctx.fillRect(0, 0, PAGE_WIDTH_PX, PAGE_HEIGHT_PX);

  ctx.save();
  if (page.skewDegrees !== 0) {
    ctx.translate(PAGE_WIDTH_PX / 2, PAGE_HEIGHT_PX / 2);
    ctx.rotate((page.skewDegrees * Math.PI) / 180);
    ctx.translate(-PAGE_WIDTH_PX / 2, -PAGE_HEIGHT_PX / 2);
  }
  ctx.fillStyle = page.ink;
  ctx.font = `${page.fontPx}px ${CORPUS_FONT_FAMILY}`;
  ctx.textBaseline = "top";

  const usableWidth = PAGE_WIDTH_PX - 2 * PAGE_MARGIN_PX;
  const columnWidth = (usableWidth - COLUMN_GAP_PX * (page.columns.length - 1)) / page.columns.length;
  const lineHeight = page.fontPx * page.lineHeightRatio;
  const bottom = PAGE_HEIGHT_PX - PAGE_MARGIN_PX;

  for (const [columnIndex, column] of page.columns.entries()) {
    const left = PAGE_MARGIN_PX + columnIndex * (columnWidth + COLUMN_GAP_PX);
    let y = PAGE_MARGIN_PX;
    for (const row of column) {
      if (y + lineHeight > bottom) {
        throw new Error(
          `case "${page.id}" does not fit on the page: it ran past the bottom margin while drawing ` +
            `"${row.join(" ")}". Shorten the case or lower its font size.`,
        );
      }
      const cellWidth = columnWidth / row.length;
      for (const [cellIndex, cell] of row.entries()) {
        if (cell !== "") ctx.fillText(cell, left + cellIndex * cellWidth, y);
      }
      y += lineHeight;
    }
  }
  ctx.restore();

  return new Uint8Array(await canvas.encode("png"));
}

/** One generated page, as the manifest records it. */
export interface CorpusEntry {
  id: string;
  catches: string;
  why: string;
  /** File name of the image, relative to the corpus directory. */
  image: string;
  /** File name of the ground truth text, relative to the corpus directory. */
  truth: string;
  fontPx: number;
  ink: string;
  paper: string;
  skewDegrees: number;
  columnCount: number;
  lineCount: number;
  /** How many numbers the page carries, so a numeric score of 1 on a page with none is readable as such. */
  numericTokenCount: number;
}

/** The index of a generated corpus. A scorecard copies its identifying fields so runs stay comparable. */
export interface CorpusManifest {
  formatVersion: number;
  generatedAt: string;
  dpi: number;
  pageWidthPx: number;
  pageHeightPx: number;
  /** The font family asked for. What it resolved to depends on the machine, which is why a scorecard is machine bound. */
  fontFamilyRequested: string;
  cases: CorpusEntry[];
}

/** The manifest's file name, which the runner looks for to decide whether a corpus exists. */
export const MANIFEST_FILENAME = "manifest.json";

/**
 * Write the whole corpus.
 *
 * The directory is emptied first. A stale image left behind from an earlier version of a case
 * would be scored against the current ground truth, and the resulting number would be wrong in a
 * way nobody could see.
 */
export async function generateCorpus(outputDir: string): Promise<CorpusManifest> {
  const createCanvas = await loadCanvasFactory();
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const cases: CorpusEntry[] = [];
  for (const page of CORPUS_CASES) {
    const truth = groundTruthFor(page);
    const png = await drawCase(page, createCanvas);
    const image = `${page.id}.png`;
    const truthFile = `${page.id}.txt`;
    await writeFile(path.join(outputDir, image), png);
    await writeFile(path.join(outputDir, truthFile), `${truth}\n`, "utf8");
    cases.push({
      id: page.id,
      catches: page.catches,
      why: page.why,
      image,
      truth: truthFile,
      fontPx: page.fontPx,
      ink: page.ink,
      paper: page.paper,
      skewDegrees: page.skewDegrees,
      columnCount: page.columns.length,
      lineCount: truth.split("\n").length,
      numericTokenCount: numericTokens(truth).length,
    });
  }

  const manifest: CorpusManifest = {
    formatVersion: CORPUS_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    dpi: CORPUS_PAGE_DPI,
    pageWidthPx: PAGE_WIDTH_PX,
    pageHeightPx: PAGE_HEIGHT_PX,
    fontFamilyRequested: CORPUS_FONT_FAMILY,
    cases,
  };
  await writeFile(path.join(outputDir, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

/** `--out=<dir>` and nothing else, because a corpus generator with options is a corpus that varies. */
function outputDirFromArgv(argv: readonly string[]): string {
  const flag = argv.find((a) => a.startsWith("--out="));
  return flag ? path.resolve(flag.slice("--out=".length)) : DEFAULT_CORPUS_DIR;
}

async function main(): Promise<void> {
  const outputDir = outputDirFromArgv(process.argv.slice(2));
  const manifest = await generateCorpus(outputDir);
  console.log(`corpus format ${manifest.formatVersion}, ${manifest.cases.length} pages, written to ${outputDir}`);
  for (const entry of manifest.cases) {
    console.log(
      `  ${entry.id.padEnd(18)} catches ${entry.catches.padEnd(28)} ` +
        `${entry.lineCount} lines, ${entry.numericTokenCount} numbers`,
    );
  }
  console.log("this corpus is synthesized. It compares engines against each other; it does not certify accuracy.");
}

// Only when run directly, so the runner can import the case list and the paths without redrawing.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
