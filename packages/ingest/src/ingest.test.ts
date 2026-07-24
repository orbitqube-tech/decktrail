import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  detectKind,
  extractPptx,
  extractDocx,
  extractPdfText,
  extract,
  CONTRACT_VERSION,
  MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER,
} from "./index.js";
import type { OcrEngine, Warning, WarningCode } from "./types.js";

/** Warnings read as one string, for asserting on the wording the author actually sees. */
const said = (warnings: Warning[]): string => warnings.map((w) => w.message).join(" ");

/** Just the codes, for asserting on what a consumer can act on rather than on prose. */
const codes = (warnings: Warning[]): WarningCode[] => warnings.map((w) => w.code);

/**
 * A stand-in engine that returns exactly what a test tells it to.
 *
 * The alternative is a test that downloads a recognition model and reads a real scan, which is
 * slow, needs the network, and would be testing somebody else's engine rather than our decision
 * about when to call it and what to say afterwards.
 */
const engineReturning = (texts: string[], engine = "test-engine/fixture"): OcrEngine => {
  return async (images) => ({
    pages: images.map((_, i) => ({ text: texts[i] ?? "" })),
    engine,
  });
};

/**
 * A real PDF, assembled here rather than stubbed.
 *
 * The cross-reference table carries byte offsets, so it has to be computed from the document as
 * it is built. A hand-typed one is wrong the moment a single character changes, and a reader
 * tolerant enough to recover from that would be hiding whether our own reading works.
 */
function makePdf(lines: string[]): Uint8Array {
  const escape = (s: string): string => s.replace(/([()\\])/g, "\\$1");
  const stream = lines.length
    ? `BT /F1 12 Tf 72 720 Td ${lines.map((l, i) => `${i ? "0 -16 Td " : ""}(${escape(l)}) Tj`).join(" ")} ET`
    : "";
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${startxref}\n%%EOF\n`;
  return strToU8(out);
}

/** A genuine .pptx: a zip whose slide XML is what PowerPoint actually writes. */
function makePptx(slides: string[][], notes: Record<number, string> = {}): Uint8Array {
  const slideXml = (paras: string[]): string =>
    `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>` +
    paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("") +
    `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const files: Record<string, Uint8Array> = { "[Content_Types].xml": strToU8("<Types/>") };
  slides.forEach((paras, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slideXml(paras));
  });
  for (const [n, text] of Object.entries(notes)) {
    files[`ppt/notesSlides/notesSlide${n}.xml`] = strToU8(slideXml([text]));
  }
  return zipSync(files);
}

function makeDocx(paragraphs: string[]): Uint8Array {
  const xml =
    `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>` +
    paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("") +
    `</w:body></w:document>`;
  return zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) });
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("working out what a file is", () => {
  it("reads the bytes, not the extension", () => {
    // The one thing an ingestion path meets constantly is a file whose name lies about it.
    expect(detectKind(PNG, "proposal.pdf")).toBe("image");
    expect(detectKind(makePdf(["hello"]), "notes.txt")).toBe("pdf");
  });

  it("separates a presentation from a document, which share a signature", () => {
    // Both are zips, so only the directory inside can tell them apart.
    expect(detectKind(makePptx([["a"]]))).toBe("pptx");
    expect(detectKind(makeDocx(["a"]))).toBe("docx");
  });

  it("falls back to the name only when the bytes say nothing", () => {
    const plain = strToU8("just some notes");
    expect(detectKind(plain)).toBe("text");
    expect(detectKind(plain, "notes.md")).toBe("text");
  });

  it("treats an unreadable zip as text rather than refusing the file", () => {
    const notAnOfficeFile = zipSync({ "random.txt": strToU8("hi") });
    expect(detectKind(notAnOfficeFile)).toBe("text");
  });
});

describe("reading a presentation", () => {
  it("keeps slides in numeric order, not alphabetical", () => {
    // slide10 sorts before slide2 as a string, which silently reorders any deck of ten or more.
    // Client decks are routinely longer than that, so this is the common case, not the edge.
    const slides = Array.from({ length: 12 }, (_, i) => [`Slide number ${i + 1}`]);
    const { pages } = extractPptx(makePptx(slides));
    expect(pages).toHaveLength(12);
    expect(pages[1]?.text).toBe("Slide number 2");
    expect(pages[9]?.text).toBe("Slide number 10");
    expect(pages.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("takes the speaker notes, which carry the argument the slide only gestures at", () => {
    const { pages } = extractPptx(makePptx([["Our approach"]], { 1: "The real reason is the migration risk" }));
    expect(pages[0]?.text).toContain("Our approach");
    expect(pages[0]?.text).toContain("Speaker notes: The real reason is the migration risk");
  });

  it("drops a notes page that is only the slide number", () => {
    const { pages } = extractPptx(makePptx([["Cover"]], { 1: "1" }));
    expect(pages[0]?.text).toBe("Cover");
  });

  it("says so when a slide carried nothing, rather than returning a silent blank", () => {
    const { pages, warnings } = extractPptx(makePptx([["Cover"], []]));
    expect(pages[1]?.text).toBe("");
    expect(said(warnings)).toMatch(/slide 2 carried no text/);
    // The code is what a consumer acts on, and the page number is what sends the author to the
    // right slide. A sentence alone gives them neither.
    expect(warnings[0]?.code).toBe("page_empty");
    expect(warnings[0]?.page).toBe(2);
  });

  it("does not repeat a line once per run inside its paragraph", () => {
    // A paragraph is a leaf: recursing past it surfaces every run again and doubles the text.
    const { pages } = extractPptx(makePptx([["Only once"]]));
    expect(pages[0]?.text.match(/Only once/g)).toHaveLength(1);
  });
});

describe("reading a document", () => {
  it("keeps paragraphs as separate lines", () => {
    const { pages } = extractDocx(makeDocx(["First paragraph", "Second paragraph"]));
    expect(pages[0]?.text).toBe("First paragraph\nSecond paragraph");
  });

  it("reports a body it could not read instead of returning empty", () => {
    const notADocx = zipSync({ "word/other.xml": strToU8("<a/>") });
    const { warnings } = extractDocx(notADocx);
    expect(said(warnings)).toMatch(/no readable body/);
  });
});

describe("reading a PDF", () => {
  it("reads the text a real PDF carries", async () => {
    const sentence = "This proposal covers the warehouse routing pilot and its commercial terms.";
    const { pages, hasTextLayer } = await extractPdfText(makePdf([sentence]));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain("warehouse routing pilot");
    expect(hasTextLayer).toBe(true);
  });

  it("recognises a page with no text of its own as one that needs reading as a picture", async () => {
    const { hasTextLayer } = await extractPdfText(makePdf([]));
    expect(hasTextLayer).toBe(false);
  });

  it("does not mistake a stray page number for a real text layer", async () => {
    // A scan is rarely perfectly empty. It carries a header, a page number, or font junk, so a
    // plain "is it empty" test passes a scan straight through as a readable document.
    const { hasTextLayer } = await extractPdfText(makePdf(["7"]));
    expect(hasTextLayer).toBe(false);
    expect(MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER).toBeGreaterThan(1);
  });
});

describe("deciding when to read a document as pictures", () => {
  const neverCalled = async (): Promise<never> => {
    throw new Error("optical character recognition was run when it should not have been");
  };

  it("does not reach for OCR when the PDF already carries its text", async () => {
    const pdf = makePdf(["A full sentence of genuine text that comfortably clears the threshold."]);
    const out = await extract(pdf, { ocrImpl: neverCalled, rasterizeImpl: neverCalled as never });
    expect(out.usedOcr).toBe(false);
    expect(out.text).toContain("genuine text");
  });

  it("reads a scanned PDF as pictures, and says that it did", async () => {
    const out = await extract(makePdf([]), {
      rasterizeImpl: async () => [PNG, PNG],
      ocrImpl: engineReturning(["text from page 1", "text from page 2"]),
    });
    expect(out.usedOcr).toBe(true);
    expect(out.pages).toHaveLength(2);
    expect(out.text).toContain("[Page 1]");
    expect(out.text).toContain("text from page 2");
    expect(codes(out.warnings)).toContain("no_text_layer");
    // The author has to be told, because OCR output is plausible and wrong in ways prose is not.
    expect(codes(out.warnings)).toContain("ocr_used");
    expect(said(out.warnings)).toMatch(/expect mistakes/);
    // Every page says where its text came from, because one PDF routinely mixes a born-digital
    // page with a scanned insert and only the page knows which it was.
    expect(out.pages.map((p) => p.source)).toEqual(["ocr", "ocr"]);
  });

  it("obeys a request never to read pictures, and warns rather than returning a quiet blank", async () => {
    const out = await extract(makePdf([]), { ocr: "never", ocrImpl: neverCalled });
    expect(out.usedOcr).toBe(false);
    expect(said(out.warnings)).toMatch(/appears to be a scan/);
    expect(codes(out.warnings)).toContain("no_text_layer");
  });

  it("separates a scan with nothing on it from a scan wearing a thin text layer", async () => {
    // Both are scans and both need reading as pictures, but they are not the same document and
    // the advice differs, so collapsing them into one warning throws away what the author needs.
    const bare = await extract(makePdf([]), { ocr: "never", ocrImpl: neverCalled });
    const thin = await extract(makePdf(["7"]), { ocr: "never", ocrImpl: neverCalled });
    expect(codes(bare.warnings)).toContain("no_text_layer");
    expect(codes(thin.warnings)).toContain("text_layer_thin");
  });

  it("forces OCR even over a text layer, for an export whose text is worse than its picture", async () => {
    const pdf = makePdf(["A full sentence of genuine text that comfortably clears the threshold."]);
    const out = await extract(pdf, {
      ocr: "force",
      rasterizeImpl: async () => [PNG],
      ocrImpl: engineReturning(["what the page actually looks like"]),
    });
    expect(out.usedOcr).toBe(true);
    expect(out.text).toBe("what the page actually looks like");
  });

  it("reads a bare image, and refuses to when told not to", async () => {
    const read = await extract(PNG, { ocrImpl: engineReturning(["scanned heading"]) });
    expect(read.usedOcr).toBe(true);
    expect(read.text).toBe("scanned heading");

    const skipped = await extract(PNG, { ocr: "never", ocrImpl: neverCalled });
    expect(skipped.text).toBe("");
    expect(said(skipped.warnings)).toMatch(/reading was turned off/);
    expect(codes(skipped.warnings)).toContain("ocr_disabled");
  });
});

describe("saying how the reading was done", () => {
  it("names the engine that actually read the pictures", async () => {
    // Two runs of the same scan on two machines can differ entirely because one had the better
    // engine installed. Without the name on the result that difference is invisible.
    const out = await extract(PNG, { ocrImpl: engineReturning(["heading"], "some-engine/v9") });
    expect(out.engine).toBe("some-engine/v9");
  });

  it("reports no engine when nothing was recognised, rather than naming one that never ran", async () => {
    const out = await extract(strToU8("plain notes"));
    expect(out.engine).toBe("none");
    expect(out.usedOcr).toBe(false);
  });

  it("leaves confidence absent rather than reporting zero when there is nothing to score", async () => {
    // Zero means recognised and terrible. Absent means there was nothing to score. Reporting the
    // first for the second makes a blank page look like a page the engine read and got wrong.
    const out = await extract(PNG, { ocrImpl: engineReturning(["heading"]) });
    expect(out.confidence).toBeUndefined();
    expect(out.pages[0]?.confidence).toBeUndefined();
  });

  it("never claims a model was called, because this package calls none", async () => {
    const out = await extract(PNG, { ocrImpl: engineReturning(["heading"]) });
    expect(out.usedAi).toBe(false);
    expect(codes(out.warnings)).not.toContain("ai_used");
  });

  it("stamps the contract version, so a consumer can refuse a shape it does not know", async () => {
    const out = await extract(strToU8("plain notes"));
    expect(out.contractVersion).toBe(CONTRACT_VERSION);
  });
});

describe("stopping early", () => {
  it("says so when a page limit dropped content, rather than truncating quietly", async () => {
    // A deck that quietly stops at page two looks exactly like a deck that was two pages long,
    // and the author would have no reason to go looking for the rest.
    const deck = await extract(makePptx([["One"], ["Two"], ["Three"]]), { maxPages: 2 });
    expect(deck.pages).toHaveLength(2);
    expect(deck.truncated).toBe(true);
    expect(codes(deck.warnings)).toContain("truncated");
    expect(said(deck.warnings)).toMatch(/only the first 2 of 3/);
  });

  it("does not report truncation when everything was read", async () => {
    const deck = await extract(makePptx([["One"], ["Two"]]), { maxPages: 5 });
    expect(deck.truncated).toBe(false);
    expect(codes(deck.warnings)).not.toContain("truncated");
  });
});

describe("what comes out the other end", () => {
  it("passes plain text through untouched", async () => {
    const out = await extract(strToU8("  just my notes  "));
    expect(out.kind).toBe("text");
    expect(out.text).toBe("just my notes");
    expect(out.usedOcr).toBe(false);
  });

  it("labels slides as slides and pages as pages, so a reader can find the passage", async () => {
    const deck = await extract(makePptx([["Cover"], ["The plan"]]));
    expect(deck.text).toContain("[Slide 1]");
    expect(deck.text).toContain("[Slide 2]");
    const doc = await extract(makePdf([]), {
      rasterizeImpl: async () => [PNG, PNG],
      ocrImpl: engineReturning(["page text", "page text"]),
    });
    expect(doc.text).toContain("[Page 1]");
  });

  it("leaves a single page unlabelled, since numbering one page is noise", async () => {
    const out = await extract(makeDocx(["One paragraph only"]));
    expect(out.text).toBe("One paragraph only");
  });
});
