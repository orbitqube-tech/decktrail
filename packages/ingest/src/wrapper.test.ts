import { describe, it, expect } from "vitest";
import { extract, detectKind, DEFAULT_OCR_LANG, CONTRACT_VERSION } from "./index.js";
import type { Extracted, OcrTier, OcrMode } from "./index.js";

/**
 * This package is a thin re-export of the shared library, so the only thing worth testing here is
 * that the re-export is intact: the names DeckTrail's own code imports still resolve, the aliases
 * still point at the library's types, and a call still runs. The library owns the behaviour and
 * tests it; duplicating those tests here would just be a second copy to drift.
 */
describe("the DeckTrail ingestion surface over the shared library", () => {
  it("re-exports the pieces the studio imports, and runs", async () => {
    const out = await extract(new TextEncoder().encode("a line of plain notes"), { filename: "notes.txt" });
    expect(out.kind).toBe("text");
    expect(out.text).toBe("a line of plain notes");
    expect(out.usedOcr).toBe(false);
    expect(out.contractVersion).toBe(CONTRACT_VERSION);
    expect(DEFAULT_OCR_LANG).toBe("eng");
    expect(detectKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("pdf");
  });

  it("keeps DeckTrail's older type names pointing at the library's types", () => {
    // A type-level check: if the aliases stopped resolving, this file would not compile. The values
    // are just there to use the imports so the compiler keeps them.
    const mode: OcrMode = "auto";
    const tier: OcrTier = "tiny";
    const shape: Pick<Extracted, "kind" | "usedOcr"> = { kind: "text", usedOcr: false };
    expect(mode).toBe("auto");
    expect(tier).toBe("tiny");
    expect(shape.usedOcr).toBe(false);
  });
});
