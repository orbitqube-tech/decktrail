import { detectKind } from "./detect.js";
import { runBestEngine } from "./engines/index.js";
import { DEFAULT_OCR_LANG } from "./engines/tesseract.js";
import { extractDocx, extractPptx } from "./office.js";
import { extractPdfText, rasterizePdf } from "./pdf.js";
import { CONTRACT_VERSION } from "./types.js";
import type { Extracted, ExtractedPage, ExtractOptions, OcrRun, Warning } from "./types.js";

export { detectKind, classifyZip } from "./detect.js";
export { extractPptx, extractDocx } from "./office.js";
export { extractPdfText, rasterizePdf, MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER, OCR_RENDER_SCALE } from "./pdf.js";
export { runBestEngine } from "./engines/index.js";
export { tesseractEngine, DEFAULT_OCR_LANG } from "./engines/tesseract.js";
export { paddleOcrImages, PaddleUnavailableError, AUTO_TIER, TIER_MODELS, PADDLE_PACKAGE } from "./engines/paddle.js";
export { CONTRACT_VERSION } from "./types.js";
export type {
  Detection,
  Extracted,
  ExtractedPage,
  ExtractOptions,
  Line,
  OcrEngine,
  OcrEngineOptions,
  OcrMode,
  OcrPageResult,
  OcrRun,
  OcrTier,
  PageSource,
  SourceKind,
  Warning,
  WarningCode,
} from "./types.js";

/** Said whenever any text came from recognition, because recognised text can be subtly wrong. */
const OCR_USED_MESSAGE =
  "the text was read off a picture, so expect mistakes and check it before sending";

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
 * Mean confidence across the pages that have one.
 *
 * Pages read from a text layer carry no confidence and are left out of the average rather than
 * counted as certain. A document that is nine clean pages and one bad scan should not report the
 * bad page away.
 */
function documentConfidence(pages: ExtractedPage[]): number | undefined {
  const scored = pages.map((p) => p.confidence).filter((c): c is number => c !== undefined);
  if (scored.length === 0) return undefined;
  return scored.reduce((sum, c) => sum + c, 0) / scored.length;
}

/** Every page that came back empty, named individually so the author knows which to go and look at. */
function emptyPageWarnings(pages: ExtractedPage[]): Warning[] {
  return pages
    .filter((p) => p.text === "")
    .map((p) => ({
      code: "page_empty" as const,
      message: `nothing readable came off page ${p.n}`,
      page: p.n,
    }));
}

/**
 * Apply the caller's page ceiling, and say so when it bites.
 *
 * Truncation is never silent. A deck that quietly stops at page fifty looks exactly like a deck
 * that was fifty pages long, and the author would have no reason to look for the rest.
 */
function applyMaxPages<T>(items: T[], maxPages: number | undefined): { kept: T[]; dropped: number } {
  if (maxPages === undefined || maxPages < 0 || items.length <= maxPages) {
    return { kept: items, dropped: 0 };
  }
  return { kept: items.slice(0, maxPages), dropped: items.length - maxPages };
}

/** The result every path returns, so no field is ever forgotten on one branch and set on another. */
function result(partial: Omit<Extracted, "contractVersion" | "usedAi">): Extracted {
  return { ...partial, usedAi: false, contractVersion: CONTRACT_VERSION };
}

/**
 * Pull the substance out of a document so it can be re-authored.
 *
 * This never promises fidelity, per DECISIONS.md D4. What comes back is the words, with a note
 * of where each came from. Layout, styling, and anything carried purely by a picture do not
 * survive, and that is the deal: the deck gets rebuilt in your own brand and layouts rather than
 * converted.
 *
 * Everything that degraded the reading is reported rather than absorbed. Ingestion fails quietly
 * by nature, and a result that looks complete is exactly what a half-read scan produces.
 */
export async function extract(bytes: Uint8Array, opts: ExtractOptions = {}): Promise<Extracted> {
  const kind = detectKind(bytes, opts.filename);
  const mode = opts.ocr ?? "auto";
  const warnings: Warning[] = [];
  const engineOpts = {
    languages: opts.languages ?? [DEFAULT_OCR_LANG],
    tier: opts.tier,
    modelPath: opts.modelPath,
    ocrLangPath: opts.ocrLangPath,
    onProgress: opts.onProgress,
  };
  const toPictures = opts.rasterizeImpl ?? rasterizePdf;

  /** Run recognition through the injected engine when there is one, else pick the best installed. */
  const readPictures = async (images: Uint8Array[]): Promise<OcrRun> => {
    if (opts.ocrImpl) return opts.ocrImpl(images, engineOpts);
    const { run, warnings: engineWarnings } = await runBestEngine(images, engineOpts);
    warnings.push(...engineWarnings);
    return run;
  };

  if (kind === "text") {
    const text = new TextDecoder().decode(bytes).trim();
    return result({
      kind,
      text,
      pages: [{ n: 1, text, source: "text_layer" }],
      usedOcr: false,
      engine: "none",
      warnings,
      truncated: false,
    });
  }

  if (kind === "pptx" || kind === "docx") {
    const { pages: read, warnings: w } = kind === "pptx" ? extractPptx(bytes) : extractDocx(bytes);
    warnings.push(...w);
    const { kept, dropped } = applyMaxPages(read, opts.maxPages);
    if (dropped > 0) {
      warnings.push({
        code: "truncated",
        message: `only the first ${kept.length} of ${read.length} ${unitLabel(kind).toLowerCase()}s were read, because a page limit was set`,
      });
    }
    // A deck is mostly pictures with captions often enough that an empty result is worth naming
    // rather than returning as a silent success.
    if (kept.every((p) => p.text === "")) {
      warnings.push({
        code: "page_empty",
        message: "nothing readable came out of this file, so there is no text to work from",
      });
    }
    return result({
      kind,
      text: assemble(kept, kind),
      pages: kept,
      usedOcr: false,
      engine: "none",
      warnings,
      truncated: dropped > 0,
    });
  }

  if (kind === "image") {
    if (mode === "never") {
      warnings.push({
        code: "ocr_disabled",
        message: "this is an image and reading was turned off, so nothing was extracted",
      });
      return result({ kind, text: "", pages: [], usedOcr: false, engine: "none", warnings, truncated: false });
    }
    const run = await readPictures([bytes]);
    const read = run.pages[0];
    const page: ExtractedPage = {
      n: 1,
      text: read?.text ?? "",
      source: "ocr",
      ...(read?.confidence !== undefined ? { confidence: read.confidence } : {}),
      ...(read?.lines ? { lines: read.lines } : {}),
    };
    warnings.push({ code: "ocr_used", message: OCR_USED_MESSAGE });
    warnings.push(...emptyPageWarnings([page]));
    return result({
      kind,
      text: page.text,
      pages: [page],
      usedOcr: true,
      engine: run.engine,
      ...(page.confidence !== undefined ? { confidence: page.confidence } : {}),
      warnings,
      truncated: false,
    });
  }

  // PDF. Read what it already carries before deciding whether to look at it as a picture.
  const { pages: textPages, hasTextLayer, hasAnyText } = await extractPdfText(bytes);
  const needsOcr = mode === "force" || (mode === "auto" && !hasTextLayer);

  if (!needsOcr) {
    if (!hasTextLayer) {
      // Two different documents arrive here and they need different advice. One has nothing in it
      // at all; the other has a header and a page number, which is a scan wearing a text layer.
      warnings.push(
        hasAnyText
          ? {
              code: "text_layer_thin",
              message:
                "this PDF carries so little text of its own that it is almost certainly a scan, and " +
                "reading was turned off, so most of it was not extracted",
            }
          : {
              code: "no_text_layer",
              message:
                "this PDF appears to be a scan and reading was turned off, so almost nothing was extracted",
            },
      );
    }
    const { kept, dropped } = applyMaxPages(textPages, opts.maxPages);
    if (dropped > 0) {
      warnings.push({
        code: "truncated",
        message: `only the first ${kept.length} of ${textPages.length} pages were read, because a page limit was set`,
      });
    }
    warnings.push(...emptyPageWarnings(kept));
    return result({
      kind,
      text: assemble(kept, kind),
      pages: kept,
      usedOcr: false,
      engine: "none",
      warnings,
      truncated: dropped > 0,
    });
  }

  if (mode !== "force") {
    warnings.push(
      hasAnyText
        ? {
            code: "text_layer_thin",
            message:
              "this PDF carries so little text of its own that it was treated as a scan, and its " +
              "pages were read as pictures",
          }
        : {
            code: "no_text_layer",
            message: "this PDF carries no text of its own, so its pages were read as pictures",
          },
    );
  }
  warnings.push({ code: "ocr_used", message: OCR_USED_MESSAGE });

  const images = await toPictures(bytes, opts.onProgress, opts.maxPages);
  const truncated = opts.maxPages !== undefined && textPages.length > images.length;
  if (truncated) {
    warnings.push({
      code: "truncated",
      message: `only the first ${images.length} of ${textPages.length} pages were read, because a page limit was set`,
    });
  }

  const run = await readPictures(images);
  const ocrPages: ExtractedPage[] = run.pages.map((page, i) => ({
    n: i + 1,
    text: page.text,
    source: "ocr" as const,
    ...(page.confidence !== undefined ? { confidence: page.confidence } : {}),
    ...(page.lines ? { lines: page.lines } : {}),
  }));
  warnings.push(...emptyPageWarnings(ocrPages));

  const confidence = documentConfidence(ocrPages);
  return result({
    kind,
    text: assemble(ocrPages, kind),
    pages: ocrPages,
    usedOcr: true,
    engine: run.engine,
    ...(confidence !== undefined ? { confidence } : {}),
    warnings,
    truncated,
  });
}
