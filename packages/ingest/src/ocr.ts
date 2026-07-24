import { createWorker } from "tesseract.js";

/**
 * Read text off pictures, locally.
 *
 * The engine is Tesseract compiled to WebAssembly, so it is an ordinary package rather than a
 * system install, and it runs on this machine. That matters more here than convenience: the
 * product's promise is that your content never leaves your computer, and sending a client's
 * scanned contract to a cloud vision service to be read would break exactly that promise. A
 * hosted service would be more accurate. It is not worth what it costs.
 *
 * One honest caveat, which the documentation must carry too: the engine downloads its language
 * data the first time it runs, unless `langPath` points at a local copy. The document itself is
 * never uploaded, but the first OCR run is not an offline operation.
 */

/** The language assumed when none is configured. */
export const DEFAULT_OCR_LANG = "eng";

export interface OcrOptions {
  lang?: string;
  /** A local directory of language data, which is what makes a run fully offline. */
  langPath?: string;
  onProgress?: (message: string) => void;
}

/**
 * Read a batch of images, in order.
 *
 * One worker is started for the whole batch rather than one per image. Starting a worker means
 * loading the engine and its language data, which costs seconds; paying that per page turns a
 * twenty page scan into minutes of pure startup.
 */
export async function ocrImages(images: Uint8Array[], opts: OcrOptions = {}): Promise<string[]> {
  if (images.length === 0) return [];
  const lang = opts.lang ?? DEFAULT_OCR_LANG;

  opts.onProgress?.(`starting the reader for ${lang}, which downloads its language data the first time`);
  const worker = await createWorker(lang, undefined, opts.langPath ? { langPath: opts.langPath } : undefined);

  try {
    const out: string[] = [];
    for (const [i, image] of images.entries()) {
      opts.onProgress?.(`reading page ${i + 1} of ${images.length}`);
      const result = await worker.recognize(Buffer.from(image));
      out.push((result.data.text ?? "").replace(/[ \t]+/g, " ").trim());
    }
    return out;
  } finally {
    // A worker holds a WebAssembly instance and its language data. Left running, a command line
    // invocation would not exit.
    await worker.terminate();
  }
}
