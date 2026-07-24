import { detectKind } from "./detect.js";
import { extractDocx, extractPptx } from "./office.js";
import { extractPdfText, rasterizePdf } from "./pdf.js";
import { DEFAULT_OCR_LANG, ocrImages } from "./ocr.js";
import type { Extracted, ExtractedPage, ExtractOptions } from "./types.js";

export { detectKind, classifyZip } from "./detect.js";
export { extractPptx, extractDocx } from "./office.js";
export { extractPdfText, rasterizePdf, MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER, OCR_RENDER_SCALE } from "./pdf.js";
export { ocrImages, DEFAULT_OCR_LANG } from "./ocr.js";
export type { Extracted, ExtractedPage, ExtractOptions, OcrMode, SourceKind } from "./types.js";

/** What each unit of a document is called, so the label matches what the reader is looking at. */
function unitLabel(kind: string): string {
  return kind === "pptx" ? "Slide" : "Page";
}

/**
 * Join the pieces into one document.
 *
 * The unit markers stay in. A model re-authoring twenty pages benefits from knowing where the
 * original broke, and an author checking the extraction needs to find the passage in the source.
 * A single page is left unmarked, because labelling "Page 1" on a one page document is noise.
 */
function assemble(pages: ExtractedPage[], kind: string): string {
  const withText = pages.filter((p) => p.text !== "");
  if (withText.length === 0) return "";
  if (withText.length === 1 && pages.length === 1) return withText[0]?.text ?? "";
  const label = unitLabel(kind);
  return withText.map((p) => `[${label} ${p.n}]\n${p.text}`).join("\n\n");
}

/**
 * Pull the substance out of a document so it can be re-authored.
 *
 * This never promises fidelity, per DECISIONS.md D4. What comes back is the words, with a note
 * of where each came from. Layout, styling, and anything carried purely by a picture do not
 * survive, and that is the deal: the deck gets rebuilt in your own brand and layouts rather than
 * converted.
 */
export async function extract(bytes: Uint8Array, opts: ExtractOptions = {}): Promise<Extracted> {
  const kind = detectKind(bytes, opts.filename);
  const mode = opts.ocr ?? "auto";
  const warnings: string[] = [];
  const ocrOpts = { lang: opts.ocrLang ?? DEFAULT_OCR_LANG, langPath: opts.ocrLangPath, onProgress: opts.onProgress };
  const readPictures = opts.ocrImpl ?? ocrImages;
  const toPictures = opts.rasterizeImpl ?? rasterizePdf;

  if (kind === "text") {
    const text = new TextDecoder().decode(bytes).trim();
    return { kind, text, pages: [{ n: 1, text }], usedOcr: false, warnings };
  }

  if (kind === "pptx" || kind === "docx") {
    const { pages, warnings: w } = kind === "pptx" ? extractPptx(bytes) : extractDocx(bytes);
    warnings.push(...w);
    // A deck is mostly pictures with captions often enough that an empty result is worth naming
    // rather than returning as a silent success.
    if (pages.every((p) => p.text === "")) {
      warnings.push("nothing readable came out of this file, so there is no text to work from");
    }
    return { kind, text: assemble(pages, kind), pages, usedOcr: false, warnings };
  }

  if (kind === "image") {
    if (mode === "never") {
      warnings.push("this is an image and reading was turned off, so nothing was extracted");
      return { kind, text: "", pages: [], usedOcr: false, warnings };
    }
    const [text = ""] = await readPictures([bytes], ocrOpts);
    warnings.push("the text was read off a picture, so expect mistakes and check it before sending");
    return { kind, text, pages: [{ n: 1, text }], usedOcr: true, warnings };
  }

  // PDF. Read what it already carries before deciding whether to look at it as a picture.
  const { pages, hasTextLayer } = await extractPdfText(bytes);
  const needsOcr = mode === "force" || (mode === "auto" && !hasTextLayer);

  if (!needsOcr) {
    if (!hasTextLayer) {
      warnings.push(
        "this PDF appears to be a scan and reading was turned off, so almost nothing was extracted",
      );
    }
    return { kind, text: assemble(pages, kind), pages, usedOcr: false, warnings };
  }

  if (mode !== "force") {
    warnings.push("this PDF carries no text of its own, so its pages were read as pictures");
  }
  warnings.push("the text was read off a picture, so expect mistakes and check it before sending");

  const images = await toPictures(bytes, opts.onProgress);
  const texts = await readPictures(images, ocrOpts);
  const ocrPages: ExtractedPage[] = texts.map((text, i) => ({ n: i + 1, text }));
  return { kind, text: assemble(ocrPages, kind), pages: ocrPages, usedOcr: true, warnings };
}
