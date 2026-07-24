import { unzipSync } from "fflate";
import type { SourceKind } from "./types.js";

/**
 * Work out what a file is from its bytes, not from its name.
 *
 * An extension is a claim, and the one thing an ingestion path meets constantly is a file whose
 * claim is wrong: a .pdf that is really a Word export, a .txt holding a base64 blob, a deck
 * saved with no extension at all. The bytes are the fact, so the name is only consulted when
 * the bytes are genuinely ambiguous, which is to say when the file is neither a known container
 * nor a known image.
 */

/** Magic byte signatures, each paired with what it means. Order matters only for readability. */
const IMAGE_SIGNATURES: ReadonlyArray<{ bytes: readonly number[]; offset?: number }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
  { bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { bytes: [0x42, 0x4d] }, // BMP
  { bytes: [0x49, 0x49, 0x2a, 0x00] }, // TIFF little endian
  { bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF big endian
];

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** WEBP is a RIFF container, so it needs both ends checked. */
function isWebp(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
}

/**
 * Both .pptx and .docx are zip archives, so the signature alone cannot separate them. The
 * directory inside can: a presentation keeps its slides under `ppt/`, a document keeps its body
 * under `word/`.
 */
export function classifyZip(bytes: Uint8Array): SourceKind | null {
  let names: string[];
  try {
    names = Object.keys(unzipSync(bytes));
  } catch {
    // A zip we cannot read is not an Office file we can read either.
    return null;
  }
  if (names.some((n) => n.startsWith("ppt/slides/"))) return "pptx";
  if (names.some((n) => n === "word/document.xml")) return "docx";
  return null;
}

export function detectKind(bytes: Uint8Array, filename?: string): SourceKind {
  if (startsWith(bytes, PDF_SIGNATURE)) return "pdf";
  if (IMAGE_SIGNATURES.some((s) => startsWith(bytes, s.bytes, s.offset)) || isWebp(bytes)) return "image";
  if (startsWith(bytes, ZIP_SIGNATURE)) {
    const office = classifyZip(bytes);
    if (office) return office;
  }

  // Nothing recognisable. The name is the last resort rather than the first, and it only gets to
  // pick between the formats whose bytes we would have caught anyway, so a mislabelled file
  // falls through to text and is read as text rather than being rejected outright.
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "pptx") return "pptx";
  if (ext === "docx") return "docx";
  if (ext && ["png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp"].includes(ext)) return "image";
  return "text";
}
