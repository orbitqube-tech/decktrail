/**
 * The shape of an extraction, and the vocabulary it reports in.
 *
 * This is a versioned boundary. A consumer that reads a `contractVersion` it does not know must
 * fail rather than guess what the rest of the object means, which is the whole reason the number
 * is on the result instead of in a changelog.
 */

/**
 * The version of the result shape below.
 *
 * Bump it when a field changes meaning or disappears, never when one is added.
 */
export const CONTRACT_VERSION = 1;

/** What a source document turned out to be, once its bytes were looked at. */
export type SourceKind = "pdf" | "pptx" | "docx" | "image" | "text";

/**
 * How hard to try optical character recognition (OCR, reading text off a picture).
 *
 * `auto` is the default and the only one most people want: run OCR when, and only when, the
 * document carries no text of its own. `never` keeps a run fast and fully offline. `force` is
 * for a PDF that has a text layer so broken it is worse than the picture it sits on, which does
 * happen with bad exports.
 */
export type OcrMode = "auto" | "never" | "force";

/**
 * Which recognition model to spend.
 *
 * Bigger tiers read a bad scan better and cost time. `auto` takes the engine's own default,
 * which is the smallest tier, and it is the default here because no measurement in this
 * repository yet says otherwise. A tier picked by hand is recorded on the result, so a run that
 * was overridden can never be mistaken for a run that was not.
 */
export type OcrTier = "auto" | "tiny" | "small" | "medium" | "server";

/**
 * Where a page's text came from.
 *
 * Per page, not per document, because one PDF routinely mixes a born-digital page with a scanned
 * insert and the reader needs to know which page to distrust. DeckTrail never emits `ai`: this
 * package calls no model, and the value exists so a result stays readable by a consumer that
 * does.
 */
export type PageSource = "text_layer" | "ocr" | "ai";

/**
 * Everything the caller should be told, as a code rather than a sentence.
 *
 * A sentence can only be shown to a person. A code can be tested for, counted, and acted on, and
 * these are surfaced rather than swallowed because the failure mode of ingestion is quiet and
 * plausible: text that is subtly wrong reads exactly like text that is right.
 */
export type WarningCode =
  /** Any text came from recognition. Always raised when it was, because recognised text may be subtly wrong. */
  | "ocr_used"
  /** A PDF carried no usable text of its own. */
  | "no_text_layer"
  /** A text layer existed but fell below the characters-per-page floor, so it was treated as a scan. */
  | "text_layer_thin"
  /** A document needed recognition and the mode was `never`, so it returned little or nothing. */
  | "ocr_disabled"
  /** The result fell below the confidence floor. */
  | "low_confidence"
  /** A page yielded nothing. */
  | "page_empty"
  /** A cap dropped content, naming what was dropped. */
  | "truncated"
  /** The format carries more than text could capture, for example a chart or an embedded object. */
  | "format_partial"
  /** A model was called, naming which path. DeckTrail's ingestion never raises this. */
  | "ai_used"
  /** The requested engine could not be loaded, naming the fallback taken. */
  | "engine_unavailable";

export interface Warning {
  code: WarningCode;
  /** Human readable, and safe to show the author as-is. */
  message: string;
  /** Which page it concerns, when it concerns one. */
  page?: number;
}

/**
 * One recognised box.
 *
 * Positions are not decoration. Reading order is reconstructed from them, and on anything laid
 * out in columns the reading order is what carries the meaning.
 */
export interface Detection {
  text: string;
  /** 0 to 1. */
  confidence: number;
  /** Left edge, in pixels of the recognised image. */
  x: number;
  /** Vertical centre, in pixels of the recognised image. */
  y: number;
  /** Box height, which is what row grouping thresholds scale against. */
  height: number;
}

/** A group of detections sharing a row. */
export interface Line {
  text: string;
  confidence?: number;
  detections?: Detection[];
}

export interface ExtractedPage {
  /** 1-based page or slide number, so a reader can find the passage in the original. */
  n: number;
  text: string;
  source: PageSource;
  /** Mean confidence for this page. Absent, never zero, when nothing was recognised. */
  confidence?: number;
  /** Present when the engine returned positions. */
  lines?: Line[];
}

export interface Extracted {
  kind: SourceKind;
  /** The whole document in reading order, normalised, ready to hand to a model. */
  text: string;
  pages: ExtractedPage[];
  /** True when any part of the text came from OCR rather than the file's own text. */
  usedOcr: boolean;
  /**
   * True when a model was called. Always false here, and separate from `usedOcr` on purpose:
   * the two have different consequences for where your content went, and conflating them is how
   * a privacy promise gets quietly broken.
   */
  usedAi: boolean;
  /**
   * Which engine and model tier produced the recognition, exactly, for example
   * `ppu-paddle-ocr/PP-OCRv6_tiny`. An unnamed engine makes a result impossible to reproduce.
   * `none` when nothing was recognised because nothing needed to be.
   */
  engine: string;
  /** Mean detection confidence across the document. Absent, never zero, when nothing was recognised. */
  confidence?: number;
  warnings: Warning[];
  /** True when `maxPages` or any internal cap dropped content. Silent truncation is forbidden. */
  truncated: boolean;
  contractVersion: number;
}

export interface ExtractOptions {
  /** The original file name, used as a hint only when the bytes are genuinely ambiguous. */
  filename?: string;
  ocr?: OcrMode;
  /** Which recognition model to spend. Defaults to the engine's own smallest tier. */
  tier?: OcrTier;
  /**
   * Recognition languages. The PP-OCR models are multilingual, so this selects a tier and a
   * dictionary rather than swapping the engine.
   */
  languages?: string[];
  /**
   * A ceiling on how many pages to read. When it truncates, a warning says so and `truncated`
   * is set. Nothing is ever dropped quietly.
   */
  maxPages?: number;
  /**
   * A local directory holding the recognition model files.
   *
   * Without one, the engine fetches its models over the network the first time it runs. Your
   * document never leaves the machine either way, but the first OCR run is not offline until
   * this points at a local copy.
   */
  modelPath?: string;
  /**
   * A local directory holding the fallback engine's language data.
   *
   * Deliberately separate from `modelPath`. The two engines want different files, and pointing
   * one at the other's directory finds nothing and reports a confusing failure.
   */
  ocrLangPath?: string;
  /** Progress for a slow document, so a long OCR pass does not look like a hang. */
  onProgress?: (message: string) => void;

  /**
   * How to read pictures, injectable for the same reason the portal's store layer is: the
   * alternative is a test that downloads a recognition model and reads a real scan, which is
   * slow, needs the network, and tests the engine rather than our decision about when to call
   * it. The default is the real thing.
   */
  ocrImpl?: OcrEngine;
  /** How to turn PDF pages into pictures. Injectable for the same reason. */
  rasterizeImpl?: (bytes: Uint8Array, onProgress?: (m: string) => void) => Promise<Uint8Array[]>;
}

/** What an engine is handed, once the pipeline has decided recognition is worth doing. */
export interface OcrEngineOptions {
  languages?: string[];
  tier?: OcrTier;
  /** A local directory of recognition model files, which is what makes a run fully offline. */
  modelPath?: string;
  /** A local directory of the fallback engine's language data, kept separate for the same reason. */
  ocrLangPath?: string;
  onProgress?: (message: string) => void;
}

/** One page as an engine returns it, before the pipeline decides what to say about it. */
export interface OcrPageResult {
  text: string;
  /** Absent, never zero, when nothing was recognised. */
  confidence?: number;
  lines?: Line[];
}

export interface OcrRun {
  pages: OcrPageResult[];
  /** Exactly which engine and tier ran, for the result to carry. */
  engine: string;
}

/**
 * Read pictures, in order.
 *
 * One interface, several backends, so which engine is installed is a deployment question rather
 * than a code change, and so the pipeline can say which one actually ran.
 */
export type OcrEngine = (images: Uint8Array[], opts: OcrEngineOptions) => Promise<OcrRun>;
