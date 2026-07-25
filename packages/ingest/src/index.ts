/**
 * DeckTrail's ingestion surface.
 *
 * The reading itself is the shared `@orbitqube/oq-ai-ocr` library: byte-level format detection,
 * text-layer-before-OCR, the readers, the engines, the pipeline. This package used to carry its own
 * copy of all of that. It now re-exports the library, so there is one implementation and one place a
 * bug gets fixed, and keeps only the two names DeckTrail's own code still spells its own way.
 */

export * from "@orbitqube/oq-ai-ocr";

/**
 * DeckTrail's older names for two library types, kept so the studio's call sites read unchanged.
 *
 * `Extracted` is the library's `ExtractionResult`; `OcrTier` is its `Tier`. They are the same
 * shapes under the names DeckTrail introduced them with, aliased rather than duplicated so they
 * cannot drift.
 */
export type { ExtractionResult as Extracted, Tier as OcrTier } from "@orbitqube/oq-ai-ocr";
