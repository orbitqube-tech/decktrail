import { describe, it, expect } from "vitest";
import type { DocumentArtifact, Pack, WatermarkConfig, Theme, Deck } from "@decktrail/ir";
import { renderDocument, renderHub, renderPortalDeck, renderPortalDocument } from "./index.js";

const theme: Theme = {
  name: "test",
  colors: {
    bg: "#0e0e0e",
    surfaceLow: "#131313",
    surfaceHigh: "#201f1f",
    accent: "#8ff5ff",
    accentDim: "#00eefc",
    accent2: "#ec63ff",
    accent2Dim: "#c600e3",
    text: "#c6c4c4",
    heading: "#f5f5f5",
    muted: "#8b8988",
  },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "logo.png" },
};

const doc: DocumentArtifact = {
  id: "doc",
  title: "Recurring costs",
  slug: "costs",
  workspace: "acme",
  kind: "document",
  blocks: [
    {
      id: "b1",
      type: "prose-section",
      heading: [{ type: "text", text: "Costs" }],
      body: [
        { type: "paragraph", content: [{ type: "text", text: "How the costs add up." }] },
        { type: "list", ordered: false, items: [[{ type: "text", text: "one" }]] },
      ],
    },
    { id: "b2", type: "code-block", language: "bash", code: "docker compose up" },
    {
      id: "b3",
      type: "long-table",
      columns: [{ label: [{ type: "text", text: "Item" }] }, { label: [{ type: "text", text: "Cost" }] }],
      rows: [[[{ type: "text", text: "Database" }], [{ type: "text", text: "free" }]]],
    },
  ],
};

const pack: Pack = {
  id: "p",
  workspace: "acme",
  title: "Acme engagement",
  artifacts: [
    { id: "d", kind: "slide-deck", slug: "proposal", title: "Proposal", blurb: "The build", audience: "external" },
    { id: "doc", kind: "document", slug: "costs", title: "Recurring costs" },
  ],
};

const wm: WatermarkConfig = {
  fields: ["recipient", "timestamp", "label"],
  template: "{recipient} · {timestamp} · {label}",
  label: "Confidential",
  opacity: 0.16,
  tiling: {},
};

const deck: Deck = {
  id: "d",
  title: "Proposal",
  slug: "proposal",
  workspace: "acme",
  kind: "slide-deck",
  slides: [{ id: "s1", layout: "cover", heading: [{ type: "text", text: "Hi" }] }],
};

describe("document renderer", () => {
  it("renders a scrolling document with prose, code, and a table", () => {
    const html = renderDocument(doc, theme);
    expect(html).toContain("<title>Recurring costs</title>");
    expect(html).toContain("How the costs add up.");
    expect(html).toContain("docker compose up");
    expect(html).toContain('class="tablewrap"');
    expect(html.includes("—")).toBe(false);
  });
});

describe("hub renderer", () => {
  it("lists numbered artifact tiles", () => {
    const html = renderHub(pack, theme);
    expect(html).toContain("Proposal");
    expect(html).toContain("Recurring costs");
    expect(html).toContain("01 Proposal");
  });
});

describe("portal renderer", () => {
  it("injects a per-viewer watermark and anti-copy protection on a deck", () => {
    const html = renderPortalDeck(deck, theme, wm, { recipient: "user@decktrail.orbitqube", timestamp: "2026-07-15 IST" });
    expect(html).toContain('id="dtwm"');
    expect(html).toContain("user@decktrail.orbitqube");
    expect(html).toContain("dtprotect");
  });

  it("injects the watermark on a document too", () => {
    const html = renderPortalDocument(doc, theme, wm, { recipient: "user@decktrail.orbitqube" });
    expect(html).toContain('id="dtwm"');
    expect(html).toContain("user@decktrail.orbitqube");
  });
});
