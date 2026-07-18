import { describe, it, expect } from "vitest";
import { DocumentArtifact, type Theme } from "@decktrail/ir";
import { renderDocument } from "./document.js";

const theme: Theme = {
  name: "t",
  colors: { bg: "#0e0e0e", surfaceLow: "#131313", surfaceHigh: "#201f1f", accent: "#8ff5ff", accentDim: "#00eefc", accent2: "#ec63ff", accent2Dim: "#c600e3", text: "#c6c4c4", heading: "#f5f5f5", muted: "#8b8988" },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "" },
};

/** Uses plain-string rich-text shorthand throughout (also exercises the coercion). */
const doc = DocumentArtifact.parse({
  id: "d",
  title: "Notes",
  slug: "notes",
  workspace: "w",
  kind: "document",
  blocks: [
    { id: "toc", type: "toc", heading: "Contents", entries: [{ label: "Overview", note: "1" }, { label: "Approach" }] },
    { id: "rk", type: "ranked-list", heading: "Priorities", items: [{ title: "Correctness", body: "First." }, { title: "Own your data" }] },
    { id: "tp", type: "two-panel", left: { title: "Email", body: [{ type: "paragraph", content: "In an inbox." }] }, right: { title: "Host", body: [{ type: "paragraph", content: "Gated." }] } },
    { id: "kg", type: "known-gaps", gaps: [{ item: "Screenshots", note: "Traceable via watermark.", state: "warn" }, { item: "Auth wall", state: "good" }] },
    { id: "sn", type: "source-note", label: "Source", body: "Turnstile plans.", href: "https://developers.cloudflare.com/turnstile/plans/" },
  ],
});

describe("document blocks (D17 subset)", () => {
  const html = renderDocument(doc, theme);

  it("renders a table of contents with entries and notes", () => {
    expect(html).toContain('<ol class="toc">');
    expect(html).toContain("Overview");
    expect(html).toContain('class="note">1</span>');
  });

  it("renders a ranked list (auto-numbered) with titles and bodies", () => {
    expect(html).toContain('<ol class="ranked">');
    expect(html).toContain('class="t">Correctness');
    expect(html).toContain('class="b">First.');
  });

  it("renders two side-by-side panels", () => {
    expect(html).toContain('<div class="twopanel">');
    expect((html.match(/class="panel"/g) ?? []).length).toBe(2);
  });

  it("renders known gaps with a state class per item", () => {
    expect(html).toContain('<ul class="gaps">');
    expect(html).toContain('<li class="warn">');
    expect(html).toContain('<li class="good">');
  });

  it("renders a source note with a label and a link", () => {
    expect(html).toContain('class="srcnote"');
    expect(html).toContain('class="lbl">Source</span>');
    expect(html).toContain('href="https://developers.cloudflare.com/turnstile/plans/"');
  });

  it("emits no em dash", () => {
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});
