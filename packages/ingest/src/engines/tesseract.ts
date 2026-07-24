import { createWorker } from "tesseract.js";
import type { OcrEngineOptions, OcrPageResult, OcrRun } from "../types.js";

/**
 * Read text off pictures, locally, with Tesseract.
 *
 * The engine is Tesseract compiled to WebAssembly, so it is an ordinary package rather than a
 * system install, and it runs on this machine. That matters more here than convenience: the
 * product's promise is that your content never leaves your computer, and sending a client's
 * scanned contract to a cloud vision service to be read would break exactly that promise. A
 * hosted service would be more accurate. It is not worth what it costs.
 *
 * This is the fallback engine rather than the preferred one. It is here because it is always
 * installed: it is a plain dependency with no native binary behind it, so it works on any machine
 * that can run the rest of the package. It reads a poor scan noticeably worse than the PP-OCR
 * engine does, which is why the registry in `./index.ts` reaches for that one first and says so
 * out loud when it has to settle for this one.
 *
 * One honest caveat, which the documentation must carry too: the engine downloads its language
 * data the first time it runs, unless `modelPath` points at a local copy. The document itself is
 * never uploaded, but the first OCR run is not an offline operation.
 */

/** The language assumed when the caller names none. */
export const DEFAULT_OCR_LANG = "eng";

/** How this engine is named on a result, before the languages are appended to it. */
export const TESSERACT_ENGINE_ID = "tesseract.js";

/**
 * What separates several languages in a single Tesseract request, for example `eng+deu`.
 *
 * This is Tesseract's own syntax for loading more than one language model into one worker, not a
 * choice made here, so it is a plus sign and cannot be anything else.
 */
export const TESSERACT_LANG_SEPARATOR = "+";

/**
 * Read a batch of images, in order.
 *
 * One worker is started for the whole batch rather than one per image. Starting a worker means
 * loading the engine and its language data, which costs seconds; paying that per page turns a
 * twenty page scan into minutes of pure startup.
 *
 * The result carries text and nothing else per page. Two absences are deliberate:
 *
 * - No `lines`. Reconstructing reading order needs the position of every recognised box, and this
 *   code path asks for none: `recognize` leaves the block detail null unless the caller requests
 *   that output format. Inventing one line per page with a made up position would look like
 *   geometry to anything downstream that groups by it, and be wrong.
 * - No `confidence`. The engine does return a page level number, but the contract's `confidence`
 *   is the mean over recognised boxes, and there are no boxes here to take a mean of. Reporting a
 *   differently derived figure under the same name would make two engines' results look
 *   comparable when they are not. Absent is honest, and the contract asks for absent rather than
 *   zero precisely so that "we did not measure this" cannot be read as "this scored nothing".
 *
 * `tier` is accepted and ignored, because this engine ships one model per language and has
 * nothing to spend a larger tier on. The pipeline records which engine ran, so a run that asked
 * for a bigger model and got this one is still traceable to the reason.
 */
export async function tesseractEngine(images: Uint8Array[], opts: OcrEngineOptions = {}): Promise<OcrRun> {
  const requested = (opts.languages ?? []).map((lang) => lang.trim()).filter((lang) => lang.length > 0);
  const languages = requested.length > 0 ? requested : [DEFAULT_OCR_LANG];
  const langs = languages.join(TESSERACT_LANG_SEPARATOR);
  const engine = `${TESSERACT_ENGINE_ID}/${langs}`;

  // Nothing to read means no worker, because starting one downloads language data and takes
  // seconds. The engine is still named, so a caller can see which one would have read them.
  if (images.length === 0) return { pages: [], engine };

  opts.onProgress?.(`starting the reader for ${langs}, which downloads its language data the first time`);
  const worker = await createWorker(langs, undefined, opts.modelPath ? { langPath: opts.modelPath } : undefined);

  try {
    const pages: OcrPageResult[] = [];
    for (const [i, image] of images.entries()) {
      opts.onProgress?.(`reading page ${i + 1} of ${images.length}`);
      const result = await worker.recognize(Buffer.from(image));
      pages.push({ text: (result.data.text ?? "").replace(/[ \t]+/g, " ").trim() });
    }
    return { pages, engine };
  } finally {
    // A worker holds a WebAssembly instance and its language data. Left running, a command line
    // invocation would not exit.
    await worker.terminate();
  }
}
