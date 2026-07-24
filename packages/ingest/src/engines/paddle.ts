import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Detection, Line, OcrEngineOptions, OcrPageResult, OcrRun, OcrTier } from "../types.js";

/**
 * Read text off pictures with PP-OCR, locally.
 *
 * PP-OCR is the family of optical character recognition (OCR, reading text off a picture) models
 * published by the PaddleOCR project. This adapter drives them through `ppu-paddle-ocr`, which
 * runs them on this machine under ONNX Runtime (Open Neural Network Exchange, the format the
 * models are shipped in). That locality is the point rather than a convenience: the product's
 * promise is that your content never leaves your computer, and posting a client's scanned
 * contract to a cloud vision service to be read would break exactly that promise.
 *
 * What this engine adds over the Tesseract one is position. It returns a box per recognised
 * fragment, so reading order can be reconstructed from geometry instead of hoped for, and on a
 * slide laid out in columns the reading order is what carries the meaning.
 *
 * Requested languages do not select anything here. The PP-OCRv6 tiers each carry one multilingual
 * dictionary, so within this family a language is not a choice the caller makes, and the
 * per-language PP-OCRv5 models are outside the tiers this package exposes. Rather than map a
 * language onto a tier by guesswork, the option is left to the tier.
 *
 * Two honest caveats, and the documentation carries both. The engine downloads its model files
 * the first time it runs, unless `modelPath` points at a local copy: the document itself is never
 * uploaded, but that first run is not an offline operation. And the package is optional, so it is
 * imported at the moment it is needed rather than at load, and its absence is reported as a
 * sentence rather than a module resolution error.
 */

/**
 * The package this adapter drives.
 *
 * Named once, because the engine string on the result and the message shown when the package is
 * missing have to agree about what to install.
 */
export const PADDLE_PACKAGE = "ppu-paddle-ocr";

/** How one recognition tier is spelled: which constant carries its files, and what it is called. */
export interface PaddleTierModel {
  /** The name of the `ModelUrls` constant exported by the package for this tier. */
  constant: string;
  /** The upstream model's own name, which is what the engine string reports. */
  label: string;
}

/**
 * The recognition tier used when the caller asks for `auto`.
 *
 * This is the incumbent default: `V6_TINY_MODEL` is the package's own default model, and the
 * smallest of them. No measurement in this repository has yet justified changing it, so it stays.
 * A bigger tier reads a bad scan better and costs time, and which way that trade falls for real
 * decks is a question for evidence, not for taste.
 */
export const AUTO_TIER: Exclude<OcrTier, "auto"> = "tiny";

/**
 * Every tier this package offers, mapped to the model it spends.
 *
 * The three PP-OCRv6 tiers are one family at three sizes, so tiny, small, and medium are the same
 * choice made three ways. `server` reaches back to the PP-OCRv5 server model, which is the
 * heaviest option the catalogue exposes.
 *
 * The constants are named rather than imported, because importing them would mean a top level
 * import of an optional package. They are read off the module object once it has actually loaded.
 */
export const TIER_MODELS: Readonly<Record<Exclude<OcrTier, "auto">, PaddleTierModel>> = {
  tiny: { constant: "V6_TINY_MODEL", label: "PP-OCRv6_tiny" },
  small: { constant: "V6_SMALL_MODEL", label: "PP-OCRv6_small" },
  medium: { constant: "V6_MEDIUM_MODEL", label: "PP-OCRv6_medium" },
  server: { constant: "V5_SERVER_MODEL", label: "PP-OCRv5_server" },
};

/** Where the three files a tier needs live, either as URLs to fetch or as paths on this machine. */
interface PaddleModelFiles {
  detection: string;
  recognition: string;
  charactersDictionary: string;
}

/**
 * The parts of the package this adapter uses, described locally.
 *
 * The same shape as the package's own declarations, restated here for the same reason the PDF
 * reader restates pdfjs: the package is optional, so it is imported through a specifier the
 * compiler cannot resolve ahead of time, and something has to say what comes back.
 */
interface PaddleBox {
  /** Left edge, in pixels of the recognised image. */
  x: number;
  /** Top edge, in pixels of the recognised image. Not the centre. */
  y: number;
  width: number;
  height: number;
}

interface PaddleRecognition {
  text: string;
  box: PaddleBox;
  /** 0 to 1. */
  confidence: number;
}

interface PaddleOcrResult {
  /** The whole picture's text, lines separated by newlines. */
  text: string;
  /** Recognised items grouped by line, in reading order, each line sorted left to right. */
  lines: PaddleRecognition[][];
  confidence: number;
}

interface PaddleService {
  /** Loads the models and the dictionary. Nothing may be recognised before this resolves. */
  initialize(): Promise<void>;
  recognize(image: ArrayBuffer, options?: { noCache?: boolean }): Promise<PaddleOcrResult>;
  /** Releases the inference sessions. */
  destroy(): Promise<void>;
}

type PaddleModule = {
  PaddleOcrService: new (options?: { model?: Partial<PaddleModelFiles> }) => PaddleService;
} & Record<string, unknown>;

/**
 * The error codes Node raises when a module cannot be resolved at all, under either module system.
 *
 * A package that is installed but whose native binary refuses to load raises something else
 * entirely, and that is deliberately absent from this list. A broken install is a real failure
 * with a real cause, and quietly reading the document with a worse engine would bury it.
 */
const MISSING_MODULE_CODES: readonly string[] = ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"];

/**
 * Raised when the optional package is simply not installed, and never for any other reason.
 *
 * A distinct type rather than a message, because the caller has to tell "you did not install the
 * good engine", which is worth falling back from, apart from "the good engine broke", which is
 * not. Matching on the text of somebody else's error message would put that decision at the mercy
 * of a wording change in Node.
 */
export class PaddleUnavailableError extends Error {
  /** The package that could not be resolved, so the caller can say what to install. */
  readonly missingPackage: string;

  constructor(missingPackage: string, options?: { cause?: unknown }) {
    super(
      `reading this document needs the optional ${PADDLE_PACKAGE} package, and its ` +
        "onnxruntime-node runtime, to recognise text in pictures. Install both, or use the " +
        "Tesseract engine instead.",
      options,
    );
    this.name = "PaddleUnavailableError";
    this.missingPackage = missingPackage;
  }
}

/** The module this error says could not be found, or undefined if it says anything else. */
function unresolvedModule(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || !MISSING_MODULE_CODES.includes(code)) return undefined;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return undefined;
  return /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message)?.[1] ?? PADDLE_PACKAGE;
}

/**
 * Load the package, or say what is missing and why it was wanted.
 *
 * Recognition needs both this package and its ONNX Runtime, and both are optional here. Most
 * people never ingest a scan, and making everyone install a native runtime for a path they will
 * not take is a poor trade.
 *
 * Only a module that could not be resolved becomes the sentinel. Anything else propagates
 * untouched, carrying its own cause, because it is a genuine fault rather than an absent option.
 */
async function loadPaddle(): Promise<PaddleModule> {
  try {
    // The specifier is held in a constant rather than written inline, so the compiler treats it as
    // dynamic. An inline specifier would have to resolve at build time, which an optional package
    // by definition may not.
    return (await import(PADDLE_PACKAGE)) as PaddleModule;
  } catch (error) {
    const missing = unresolvedModule(error);
    if (missing === undefined) throw error;
    throw new PaddleUnavailableError(missing, { cause: error });
  }
}

/** True when a value carries the three file locations a tier needs, all of them as strings. */
function isModelFiles(value: unknown): value is PaddleModelFiles {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["detection"] === "string" &&
    typeof candidate["recognition"] === "string" &&
    typeof candidate["charactersDictionary"] === "string"
  );
}

/**
 * Read a tier's model constant off the loaded package.
 *
 * A missing or reshaped constant fails here, loudly, naming what was looked for. The alternative
 * is constructing the service with no model at all, which would quietly run some other tier than
 * the one the caller asked for and report the one they asked for.
 */
function modelFilesFor(paddle: PaddleModule, tier: PaddleTierModel): PaddleModelFiles {
  const value = paddle[tier.constant];
  if (!isModelFiles(value)) {
    throw new Error(
      `${PADDLE_PACKAGE} does not export a usable ${tier.constant}, so the ${tier.label} model ` +
        "files cannot be located. Check the installed version matches the one this package asks for.",
    );
  }
  return value;
}

/**
 * The file name at the end of a model location.
 *
 * A local model directory holds the same files the engine would otherwise fetch, under the same
 * names, so the names are taken from the package's own locations rather than written down here.
 * Written down, they would be a second copy of somebody else's decision, and would rot silently
 * the first time the catalogue moved a file.
 */
function fileNameOf(location: string): string {
  const withoutQuery = location.split(/[?#]/)[0] ?? "";
  const name = withoutQuery.split("/").pop() ?? "";
  if (name === "") {
    throw new Error(`${PADDLE_PACKAGE} gave a model location with no file name in it: ${location}`);
  }
  return name;
}

/**
 * Point the three model files at a local directory, so the run touches no network at all.
 *
 * Each location is checked before it is handed over, because the failure otherwise arrives from
 * inside the engine, long after the point where the directory could be named.
 */
function localModelFiles(files: PaddleModelFiles, directory: string): PaddleModelFiles {
  const local: PaddleModelFiles = {
    detection: join(directory, fileNameOf(files.detection)),
    recognition: join(directory, fileNameOf(files.recognition)),
    charactersDictionary: join(directory, fileNameOf(files.charactersDictionary)),
  };
  for (const file of Object.values(local)) {
    if (!existsSync(file)) {
      throw new Error(
        `the model directory ${directory} does not hold ${file}, which this tier needs. A local ` +
          "model directory carries the same file names the engine would otherwise download, so " +
          "copy them there, or leave the directory unset and let the first run fetch them.",
      );
    }
  }
  return local;
}

/**
 * One recognised fragment, in the vocabulary the contract speaks.
 *
 * The engine reports a box by its top left corner; the contract wants the vertical centre, which
 * is what row grouping compares against. Half the height converts one to the other, and getting
 * this wrong is invisible: every fragment would sit half a line too high, and the reading order
 * would come out subtly scrambled on exactly the dense slides where it matters.
 */
function toDetection(item: PaddleRecognition): Detection {
  return {
    text: item.text,
    confidence: item.confidence,
    x: item.box.x,
    y: item.box.y + item.box.height / 2,
    height: item.box.height,
  };
}

/**
 * Mean confidence, or nothing at all.
 *
 * Zero means recognised and terrible. Nothing recognised has no score to give, and reporting zero
 * for it would make a blank page indistinguishable from a page the engine read and got wrong.
 */
function meanConfidence(detections: Detection[]): number | undefined {
  if (detections.length === 0) return undefined;
  return detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
}

/**
 * Turn one picture's result into one page.
 *
 * The confidence is averaged over the detections being returned rather than taken from the
 * engine's own average, so the number and the lines underneath it are the same answer told twice.
 */
function toPage(result: PaddleOcrResult): OcrPageResult {
  const lines: Line[] = [];
  const all: Detection[] = [];

  for (const group of result.lines) {
    const detections = group.map(toDetection);
    all.push(...detections);
    lines.push({
      // The engine sorts each line left to right, so rejoining on a single space restores the
      // line as it reads.
      text: detections
        .map((d) => d.text)
        .join(" ")
        .trim(),
      confidence: meanConfidence(detections),
      detections,
    });
  }

  return {
    text: result.text.replace(/[ \t]+/g, " ").trim(),
    confidence: meanConfidence(all),
    lines,
  };
}

/**
 * Read a batch of pictures, in order.
 *
 * One service is started for the whole batch rather than one per picture. Starting a service
 * means loading a detection model, a recognition model, and a character dictionary into inference
 * sessions, which costs seconds; paying that per page turns a twenty page scan into minutes of
 * pure startup.
 *
 * Recognition runs with the engine's own result cache turned off, and that is deliberate. The
 * cache is keyed on the picture, not on the tier or the settings the picture was read with, so an
 * author who reads a scan, sees a bad result, and reads it again at a larger tier gets the first
 * reading handed straight back, reported as the tier they asked for. Measured on a rotated test
 * page: with the cache live, three different models returned byte-identical text and a confidence
 * identical to sixteen decimal places, which is what sent us looking. Do not remove this without
 * reading that back.
 */
export async function paddleOcrImages(images: Uint8Array[], opts: OcrEngineOptions = {}): Promise<OcrRun> {
  const tier = TIER_MODELS[opts.tier && opts.tier !== "auto" ? opts.tier : AUTO_TIER];
  const engine = `${PADDLE_PACKAGE}/${tier.label}`;

  // Nothing to read means nothing to load. The tier is still named, because a caller comparing
  // two runs needs to see which engine would have run as much as which one did.
  if (images.length === 0) return { pages: [], engine };

  const paddle = await loadPaddle();
  const catalogue = modelFilesFor(paddle, tier);
  const model = opts.modelPath ? localModelFiles(catalogue, opts.modelPath) : catalogue;

  opts.onProgress?.(
    opts.modelPath
      ? `starting the ${tier.label} reader from ${opts.modelPath}`
      : `starting the ${tier.label} reader, which downloads its model files the first time`,
  );

  const service = new paddle.PaddleOcrService({ model });
  try {
    await service.initialize();

    const pages: OcrPageResult[] = [];
    for (const [i, image] of images.entries()) {
      opts.onProgress?.(`reading page ${i + 1} of ${images.length}`);
      // A copy, into a buffer of exactly this picture's length. A Uint8Array is often a view onto
      // a larger pooled buffer, and handing the underlying buffer over would pass the engine the
      // neighbouring pages' bytes along with this one's.
      const buffer = new ArrayBuffer(image.byteLength);
      new Uint8Array(buffer).set(image);
      pages.push(toPage(await service.recognize(buffer, { noCache: true })));
    }
    return { pages, engine };
  } finally {
    // The service holds two ONNX Runtime inference sessions and the model weights behind them.
    // Left open, a command line invocation would not exit. A failure to release cannot be
    // repaired by the caller and must not replace whatever error is already on its way up, so it
    // is dropped here on purpose.
    await service.destroy().catch(() => undefined);
  }
}
