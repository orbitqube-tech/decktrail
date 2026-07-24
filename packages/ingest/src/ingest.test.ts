import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { detectKind, extractPptx, extractDocx, extractPdfText, extract, MIN_CHARS_PER_PAGE_FOR_TEXT_LAYER } from "./index.js";

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
    expect(warnings.join(" ")).toMatch(/slide 2 carried no text/);
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
    expect(warnings.join(" ")).toMatch(/no readable body/);
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
  const neverCalled = async (): Promise<string[]> => {
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
      ocrImpl: async (images) => images.map((_, i) => `text from page ${i + 1}`),
    });
    expect(out.usedOcr).toBe(true);
    expect(out.pages).toHaveLength(2);
    expect(out.text).toContain("[Page 1]");
    expect(out.text).toContain("text from page 2");
    expect(out.warnings.join(" ")).toMatch(/carries no text of its own/);
    // The author has to be told, because OCR output is plausible and wrong in ways prose is not.
    expect(out.warnings.join(" ")).toMatch(/expect mistakes/);
  });

  it("obeys a request never to read pictures, and warns rather than returning a quiet blank", async () => {
    const out = await extract(makePdf([]), { ocr: "never", ocrImpl: neverCalled });
    expect(out.usedOcr).toBe(false);
    expect(out.warnings.join(" ")).toMatch(/appears to be a scan/);
  });

  it("forces OCR even over a text layer, for an export whose text is worse than its picture", async () => {
    const pdf = makePdf(["A full sentence of genuine text that comfortably clears the threshold."]);
    const out = await extract(pdf, {
      ocr: "force",
      rasterizeImpl: async () => [PNG],
      ocrImpl: async () => ["what the page actually looks like"],
    });
    expect(out.usedOcr).toBe(true);
    expect(out.text).toBe("what the page actually looks like");
  });

  it("reads a bare image, and refuses to when told not to", async () => {
    const read = await extract(PNG, { ocrImpl: async () => ["scanned heading"] });
    expect(read.usedOcr).toBe(true);
    expect(read.text).toBe("scanned heading");

    const skipped = await extract(PNG, { ocr: "never", ocrImpl: neverCalled });
    expect(skipped.text).toBe("");
    expect(skipped.warnings.join(" ")).toMatch(/reading was turned off/);
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
      ocrImpl: async (i) => i.map(() => "page text"),
    });
    expect(doc.text).toContain("[Page 1]");
  });

  it("leaves a single page unlabelled, since numbering one page is noise", async () => {
    const out = await extract(makeDocx(["One paragraph only"]));
    expect(out.text).toBe("One paragraph only");
  });
});
