import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { ExtractedPage, Warning } from "./types.js";

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

/**
 * A second parser, for the relationship parts.
 *
 * The one above throws attributes away, which is right for prose and useless here: a relationship
 * is nothing but attributes. Document order does not matter in a relationship part, so this one
 * keeps the plain shape rather than the ordered one.
 */
const relsParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * The relationship type a slide uses to point at its speaker notes.
 *
 * Matched on the type rather than on the target's file name, because the type is what the format
 * guarantees. A target is free to be named anything and to sit anywhere.
 */
const NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX = "/notesSlide";

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

/**
 * Where a relationship's target actually lives inside the archive.
 *
 * A target is written relative to the part that declares it, so `../notesSlides/notesSlide1.xml`
 * inside `ppt/slides/_rels/slide3.xml.rels` means `ppt/notesSlides/notesSlide1.xml`. A target
 * beginning with a slash is relative to the root of the package instead.
 */
function resolveRelationshipTarget(sourcePart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segments = sourcePart.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/** One or many, as fast-xml-parser gives it: a single relationship does not arrive as a list. */
function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/**
 * The notes part belonging to this slide, found by asking the slide rather than by counting.
 *
 * A deck names its notes parts in their own sequence and records which slide each one belongs to
 * in that slide's relationship part. The two numbers only line up when every slide from the first
 * onwards has notes, which is the exception rather than the rule: a deck with notes on slide three
 * alone stores them in `notesSlide1.xml`. Pairing the nth notes part with the nth slide therefore
 * attaches one slide's speaker notes to a different slide, silently, and speaker notes are exactly
 * the material that carries the argument. Getting this wrong does not look like a bug in the
 * output; it looks like a deck that said something it never said.
 *
 * When the slide has no relationship part, or none of its relationships is a notes relationship,
 * the answer is that there are no notes. It is deliberately not "guess by position": a value that
 * cannot be read is not a value to invent.
 */
function notesPartFor(files: Record<string, Uint8Array>, slidePart: string): string | null {
  const slideFile = slidePart.split("/").pop();
  if (slideFile === undefined) return null;
  const relsPart = `${slidePart.split("/").slice(0, -1).join("/")}/_rels/${slideFile}.rels`;

  const relsXml = readEntry(files, relsPart);
  if (relsXml === null) return null;

  let parsed: unknown;
  try {
    parsed = relsParser.parse(relsXml);
  } catch {
    // A relationship part we cannot read tells us nothing about the notes, which is the same
    // position as a deck with no relationship part at all.
    return null;
  }

  const root = isRecord(parsed) ? parsed["Relationships"] : undefined;
  const relationships = isRecord(root) ? asList(root["Relationship"]) : [];

  for (const relationship of relationships) {
    if (!isRecord(relationship)) continue;
    const type = relationship["@_Type"];
    const target = relationship["@_Target"];
    if (typeof type !== "string" || typeof target !== "string") continue;
    if (!type.endsWith(NOTES_SLIDE_RELATIONSHIP_TYPE_SUFFIX)) continue;
    // An external target is a link to something outside the package, so there is nothing in the
    // archive to read.
    if (relationship["@_TargetMode"] === "External") continue;

    // Relative to the slide itself, not to the `_rels` folder its relationships are filed in.
    const resolved = resolveRelationshipTarget(slidePart, target);
    return files[resolved] ? resolved : null;
  }
  return null;
}

/**
 * Read a presentation.
 *
 * Warnings come back as codes carrying their sentence, not as sentences alone, so a caller can
 * count how many slides came back empty or refuse a deck where most of them did. The page number
 * rides along on every warning that is about one slide, because "a slide carried no text" is
 * unactionable until you know which slide.
 */
export function extractPptx(bytes: Uint8Array): { pages: ExtractedPage[]; warnings: Warning[] } {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  const names = Object.keys(files);
  const slides = slideOrder(names, "ppt/slides/slide");
  const warnings: Warning[] = [];

  const pages: ExtractedPage[] = slides.map((name, i) => {
    const xml = readEntry(files, name);
    const lines: string[] = [];
    if (xml) paragraphs(parser.parse(xml), "a:p", lines);

    // Speaker notes carry the argument the slide only gestures at, and they are exactly the
    // material a re-authored deck wants. They are labelled so the model can tell them from what
    // was on the slide itself. Which notes belong to this slide is read off the slide's own
    // relationships, never inferred from the order the parts happen to be numbered in.
    const notesPart = notesPartFor(files, name);
    const noteXml = notesPart ? readEntry(files, notesPart) : null;
    if (noteXml) {
      const noteLines: string[] = [];
      paragraphs(parser.parse(noteXml), "a:p", noteLines);
      // PowerPoint stores the slide number as a note paragraph; drop a lone number.
      const meaningful = noteLines.filter((l) => !/^\d+$/.test(l));
      if (meaningful.length > 0) lines.push(`Speaker notes: ${meaningful.join(" ")}`);
    }

    if (lines.length === 0) {
      warnings.push({
        code: "page_empty",
        message: `slide ${i + 1} carried no text, so nothing was taken from it`,
        page: i + 1,
      });
    }
    // The words came out of the file's own XML, so they are the document's text and never
    // recognised text.
    return { n: i + 1, text: lines.join("\n"), source: "text_layer" };
  });

  if (pages.length === 0) {
    warnings.push({ code: "page_empty", message: "no slides were found in this presentation" });
  }
  return { pages, warnings };
}

/**
 * Read a document.
 *
 * The two ways this comes back empty share a code but not a sentence, on purpose. A file with no
 * body part at all is malformed or is not really a Word document. A body that parsed and yielded
 * no paragraphs is an intact document whose content is carried entirely by pictures or embedded
 * objects. An author who is told only "empty" will go looking in the wrong place.
 */
export function extractDocx(bytes: Uint8Array): { pages: ExtractedPage[]; warnings: Warning[] } {
  const files = unzipSync(bytes) as Record<string, Uint8Array>;
  const xml = readEntry(files, "word/document.xml");
  if (!xml) {
    return { pages: [], warnings: [{ code: "page_empty", message: "this document has no readable body" }] };
  }

  const lines: string[] = [];
  paragraphs(parser.parse(xml), "w:p", lines);

  // A Word file has no page breaks that survive without laying the whole thing out, so it comes
  // through as one unit. Claiming page numbers we cannot know would be inventing them.
  const warnings: Warning[] =
    lines.length === 0 ? [{ code: "page_empty", message: "this document carried no text" }] : [];
  return { pages: [{ n: 1, text: lines.join("\n"), source: "text_layer" }], warnings };
}
