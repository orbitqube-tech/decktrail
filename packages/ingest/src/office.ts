import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedPage } from "./types.js";

/**
 * Pull the words out of a PowerPoint deck or a Word document.
 *
 * Both formats are a zip of XML, so nothing here needs to render anything or run any binary:
 * the text is already text, sitting in known files inside the archive. That is why these come
 * before optical character recognition (OCR) in the pipeline and why most real client documents
 * never need OCR at all.
 *
 * What comes out is the substance, not the design. Per DECISIONS.md D4 this path re-authors
 * rather than converts, so the layout, the master slides, the animations and the exact ordering
 * of overlapping text boxes are deliberately not preserved. Anything that matters has to survive
 * as words.
 */

/** `preserveOrder` keeps document order, which is the whole point when reading prose. */
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: true, trimValues: true });

/** A node in the ordered parse: one tag name pointing at its children, or a `#text` leaf. */
type Ordered = Record<string, unknown>;

function isRecord(v: unknown): v is Ordered {
  return typeof v === "object" && v !== null;
}

/** Every `#text` leaf beneath this subtree, in order. */
function textUnder(nodes: unknown, out: string[]): void {
  if (Array.isArray(nodes)) {
    for (const n of nodes) textUnder(n, out);
    return;
  }
  if (!isRecord(nodes)) return;
  for (const [key, value] of Object.entries(nodes)) {
    if (key === "#text") {
      if (typeof value === "string" && value !== "") out.push(value);
    } else {
      textUnder(value, out);
    }
  }
}

/**
 * Every paragraph in the subtree, as one line each.
 *
 * A paragraph is treated as a leaf: once one is found its whole subtree becomes a single line
 * and recursion stops there. Without that, a run inside a paragraph would surface again on its
 * own and every line would appear twice.
 */
function paragraphs(nodes: unknown, paraTag: string, out: string[]): void {
  if (Array.isArray(nodes)) {
    for (const n of nodes) paragraphs(n, paraTag, out);
    return;
  }
  if (!isRecord(nodes)) return;
  for (const [key, value] of Object.entries(nodes)) {
    if (key === paraTag) {
      const parts: string[] = [];
      textUnder(value, parts);
      const line = parts.join("").trim();
      if (line !== "") out.push(line);
    } else {
      paragraphs(value, paraTag, out);
    }
  }
}

function readEntry(files: Record<string, Uint8Array>, name: string): string | null {
  const entry = files[name];
  return entry ? strFromU8(entry) : null;
}

/**
 * Slides sort numerically, never as strings.
 *
 * `slide10.xml` sorts before `slide2.xml` alphabetically, which silently reorders any deck with
 * ten or more slides. Client decks are routinely longer than that, so the bug would be the
 * common case rather than the edge one.
 */
function slideOrder(names: string[], prefix: string): string[] {
  const num = (n: string): number => Number(n.replace(/\D+/g, "")) || 0;
  return names.filter((n) => n.startsWith(prefix)).sort((a, b) => num(a) - num(b));
}

export function extractPptx(bytes: Uint8Array): { pages: ExtractedPage[]; warnings: string[] } {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  const names = Object.keys(files);
  const slides = slideOrder(names, "ppt/slides/slide");
  const notes = slideOrder(names, "ppt/notesSlides/notesSlide");
  const warnings: string[] = [];

  const pages: ExtractedPage[] = slides.map((name, i) => {
    const xml = readEntry(files, name);
    const lines: string[] = [];
    if (xml) paragraphs(parser.parse(xml), "a:p", lines);

    // Speaker notes carry the argument the slide only gestures at, and they are exactly the
    // material a re-authored deck wants. They are labelled so the model can tell them from what
    // was on the slide itself.
    const noteXml = notes[i] ? readEntry(files, notes[i] as string) : null;
    if (noteXml) {
      const noteLines: string[] = [];
      paragraphs(parser.parse(noteXml), "a:p", noteLines);
      // PowerPoint stores the slide number as a note paragraph; drop a lone number.
      const meaningful = noteLines.filter((l) => !/^\d+$/.test(l));
      if (meaningful.length > 0) lines.push(`Speaker notes: ${meaningful.join(" ")}`);
    }

    if (lines.length === 0) warnings.push(`slide ${i + 1} carried no text, so nothing was taken from it`);
    return { n: i + 1, text: lines.join("\n") };
  });

  if (pages.length === 0) warnings.push("no slides were found in this presentation");
  return { pages, warnings };
}

export function extractDocx(bytes: Uint8Array): { pages: ExtractedPage[]; warnings: string[] } {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  const xml = readEntry(files, "word/document.xml");
  if (!xml) return { pages: [], warnings: ["this document has no readable body"] };

  const lines: string[] = [];
  paragraphs(parser.parse(xml), "w:p", lines);

  // A Word file has no page breaks that survive without laying the whole thing out, so it comes
  // through as one unit. Claiming page numbers we cannot know would be inventing them.
  const warnings = lines.length === 0 ? ["this document carried no text"] : [];
  return { pages: [{ n: 1, text: lines.join("\n") }], warnings };
}
