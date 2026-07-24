import type { ExtractedPage } from "./types.js";

/**
 * Read a PDF.
 *
 * Two very different files arrive with the same extension. One was exported from a word
 * processor or a design tool and carries its text inside it, which can simply be read. The other
 * is a scan or a photograph, a picture of a page with no text in it at all, and the only way to
 * get words out is optical character recognition (OCR).
 *
 * Telling them apart matters more than it sounds: running OCR on a PDF that already has text is
 * slow and produces a worse result than the text sitting right there, and failing to run it on a
 * scan produces an empty document and a confident silence. So the text layer is read first and
 * measured, and OCR is the fallback rather than the default.
 */

/**
 * How much text a page must yield before its text layer is believed.
 *
 * A scanned page is not always empty. It often carries a stray header, a page number, or a few
 * characters of junk from a failed embedded font, so a simple "is it empty" test passes a scan
 * straight through as a real document. Forty characters is comfortably below any genuine page of
 * prose and comfortably above that noise.
 */
export const MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER = 40;

/**
 * How much to magnify a page before handing it to OCR.
 *
 * OCR accuracy depends on how many pixels each character occupies, and a PDF page rendered at
 * its natural size is around 96 dots per inch, which is below what the engine wants. Rendering
 * at twice that trades memory for a materially better read.
 */
export const OCR_RENDER_SCALE = 2;

interface PdfTextItem {
  str?: string;
}
interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: unknown; viewport: PdfViewport }): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  cleanup(): void;
}

/**
 * The handle that owns the document's resources.
 *
 * Releasing is on the loading task rather than on the document itself, which is easy to get
 * wrong: the document looks like the thing you opened, so it looks like the thing you close.
 * Closing the wrong one leaks the worker and its buffers for the life of the process.
 */
interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface OpenPdf {
  doc: PdfDocument;
  release: () => Promise<void>;
}

/**
 * Load the document.
 *
 * The legacy build is the one meant for a plain Node process rather than a browser, and the
 * worker is turned off because spawning one buys nothing here: ingestion already runs inside a
 * command the author is waiting on, and a worker only adds a way for it to fail.
 */
async function loadPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument(options: Record<string, unknown>): PdfLoadingTask;
  };
  // A copy, because pdfjs takes ownership of the buffer it is handed and detaches it, which
  // would leave the caller holding an empty array if the same bytes are needed again for OCR.
  const data = new Uint8Array(bytes);
  const task = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableWorker: true });
  return { doc: await task.promise, release: () => task.destroy() };
}

export interface PdfText {
  pages: ExtractedPage[];
  /** True when the document's own text is substantial enough to use as-is. */
  hasTextLayer: boolean;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const { doc, release } = await loadPdf(bytes);
  try {
    const pages: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // pdfjs returns positioned fragments rather than lines. Joining on a space and collapsing
      // runs of whitespace is enough for re-authoring, which wants the words and not the layout.
      const text = content.items
        .map((i) => i.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ n, text });
      page.cleanup();
    }
    const total = pages.reduce((sum, p) => sum + p.text.length, 0);
    const average = pages.length > 0 ? total / pages.length : 0;
    return { pages, hasTextLayer: average >= MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER };
  } finally {
    await release();
  }
}

/**
 * Render every page to a PNG so OCR has something to look at.
 *
 * The canvas library is an optional dependency and is imported only here, at the moment a
 * scanned PDF actually needs rasterising. Most people never ingest one, and making everybody
 * install a native binary for a path they will not take is a poor trade. When it is missing the
 * failure names the package and what to do, rather than surfacing a module-resolution error.
 */
export async function rasterizePdf(bytes: Uint8Array, onProgress?: (m: string) => void): Promise<Uint8Array[]> {
  let createCanvas: (w: number, h: number) => { getContext(t: "2d"): unknown; encode(f: "png"): Promise<Buffer> };
  try {
    ({ createCanvas } = (await import("@napi-rs/canvas")) as unknown as {
      createCanvas: (w: number, h: number) => { getContext(t: "2d"): unknown; encode(f: "png"): Promise<Buffer> };
    });
  } catch {
    throw new Error(
      "this PDF is a scan, so reading it needs the optional @napi-rs/canvas package to turn its " +
        "pages into images. Install it, or pass a text-based file instead.",
    );
  }

  const { doc, release } = await loadPdf(bytes);
  try {
    const images: Uint8Array[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(`rendering page ${n} of ${doc.numPages} for reading`);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push(new Uint8Array(await canvas.encode("png")));
      page.cleanup();
    }
    return images;
  } finally {
    await release();
  }
}
