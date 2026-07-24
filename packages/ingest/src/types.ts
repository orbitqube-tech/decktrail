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

export interface ExtractedPage {
  /** 1-based page or slide number, so a reader can find the passage in the original. */
  n: number;
  text: string;
}

export interface Extracted {
  kind: SourceKind;
  /** The whole document, normalised, ready to hand to a model. */
  text: string;
  pages: ExtractedPage[];
  /** True when any part of the text came from OCR rather than the file's own text. */
  usedOcr: boolean;
  /**
   * Anything the caller should tell the author about: a page that yielded nothing, OCR being
   * used at all, a format that carries more than the text could capture. These are surfaced,
   * never swallowed, because the failure mode of ingestion is quiet and plausible.
   */
  warnings: string[];
}

export interface ExtractOptions {
  /** The original file name, used as a hint when the bytes are ambiguous. */
  filename?: string;
  ocr?: OcrMode;
  /** Tesseract language code, for example "eng". */
  ocrLang?: string;
  /**
   * A local directory holding the OCR language data.
   *
   * Without one, the engine fetches its language data over the network on first use. Your
   * document never leaves the machine either way, but the run is not fully offline until this
   * points at a local copy.
   */
  ocrLangPath?: string;
  /** Progress for a slow document, so a long OCR pass does not look like a hang. */
  onProgress?: (message: string) => void;

  /**
   * How to read pictures, injectable for the same reason the portal's store layer is: the
   * alternative is a test that downloads a language model and reads a real scan, which is slow,
   * needs the network, and tests the engine rather than our decision about when to call it. The
   * default is the real thing.
   */
  ocrImpl?: (images: Uint8Array[], opts: { lang?: string; langPath?: string }) => Promise<string[]>;
  /** How to turn PDF pages into pictures. Injectable for the same reason. */
  rasterizeImpl?: (bytes: Uint8Array, onProgress?: (m: string) => void) => Promise<Uint8Array[]>;
}
