import { describe, it, expect } from "vitest";
import { Deck, DocumentArtifact, Slide, Pack, Tool, RichText } from "./index.js";

describe("rich text shorthand", () => {
  it("coerces a plain string to a single text run", () => {
    expect(RichText.parse("Hello")).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("still accepts the full run array, including links", () => {
    const runs = [
      { type: "text", text: "See " },
      { type: "link", text: "the docs", href: "https://x" },
    ];
    expect(RichText.parse(runs)).toEqual(runs);
  });

  it("lets a slide be authored with plain-string fields", () => {
    const slide = Slide.parse({ id: "s", layout: "bullets", heading: "Scope", items: ["One", "Two"] });
    expect(slide.layout === "bullets" && slide.heading).toEqual([{ type: "text", text: "Scope" }]);
    expect(slide.layout === "bullets" && slide.items).toEqual([
      [{ type: "text", text: "One" }],
      [{ type: "text", text: "Two" }],
    ]);
  });
});

describe("deck IR", () => {
  it("accepts a minimal slide deck with a bullets slide", () => {
    const deck = Deck.parse({
      id: "d1",
      title: "Proposal",
      slug: "proposal",
      workspace: "acme",
      kind: "slide-deck",
      slides: [
        {
          id: "s1",
          layout: "bullets",
          heading: [{ type: "text", text: "What we would build" }],
          items: [[{ type: "text", text: "Intake" }], [{ type: "text", text: "Scheduling" }]],
        },
      ],
    });
    expect(deck.slides.length).toBe(1);
  });

  it("rejects an unknown slide layout", () => {
    expect(() => Slide.parse({ id: "s", layout: "does-not-exist" })).toThrow();
  });

  it("accepts a scrolling document with a prose section", () => {
    const doc = DocumentArtifact.parse({
      id: "doc1",
      title: "Recurring costs",
      slug: "recurring-costs",
      workspace: "acme",
      kind: "document",
      blocks: [
        {
          id: "b1",
          type: "prose-section",
          heading: [{ type: "text", text: "Costs" }],
          body: [{ type: "paragraph", content: [{ type: "text", text: "How the costs add up." }] }],
        },
      ],
    });
    expect(doc.blocks[0]?.type).toBe("prose-section");
  });

  it("accepts an interactive pricing tool", () => {
    const tool = Tool.parse({
      id: "t1",
      title: "Commercials",
      slug: "commercials",
      workspace: "acme",
      kind: "tool",
      tool: "pricing",
      lines: [{ description: [{ type: "text", text: "MVP build" }], offerPrice: 250000 }],
      locale: { currency: "INR" },
    });
    expect(tool.lines[0]?.offerPrice).toBe(250000);
    // Defaults are applied.
    expect(tool.presenterMode).toBe(false);
    expect(tool.lines[0]?.include).toBe(true);
  });

  it("accepts pricing lines tagged into subtotal groups", () => {
    const tool = Tool.parse({
      id: "t2",
      title: "Commercials",
      slug: "commercials",
      workspace: "acme",
      kind: "tool",
      tool: "pricing",
      lines: [
        { description: [{ type: "text", text: "MVP build" }], offerPrice: 250000, group: "Core" },
        { description: [{ type: "text", text: "WhatsApp channel" }], offerPrice: 60000, group: "Optional", include: false },
      ],
      locale: { currency: "INR" },
    });
    expect(tool.lines[0]?.group).toBe("Core");
    expect(tool.lines[1]?.include).toBe(false);
  });

  it("accepts a pack referencing mixed artifacts", () => {
    const pack = Pack.parse({
      id: "p1",
      workspace: "acme",
      title: "Acme engagement",
      artifacts: [
        { id: "d1", kind: "slide-deck", slug: "mvp", title: "MVP proposal" },
        { id: "doc1", kind: "document", slug: "costs", title: "Recurring costs" },
        { id: "t1", kind: "tool", slug: "commercials", title: "Commercials" },
      ],
    });
    expect(pack.artifacts.length).toBe(3);
  });
});

describe("text that says nothing, and grids with a hole in them", () => {
  const deckWith = (slide: unknown) =>
    Deck.safeParse({ id: "d", title: "T", slug: "t", workspace: "w", kind: "slide-deck", slides: [slide] });
  const card = (title: unknown) => ({ title, body: "some body" });

  it("rejects empty rich text, which is what put a blank card on a slide", () => {
    // [] is a perfectly good InlineRun[], so `title: []` validated, and the model's blank fifth
    // card reached the slide as an empty box. Constrain at the boundary, not at the renderer.
    expect(RichText.safeParse([]).success).toBe(false);
    expect(RichText.safeParse("").success).toBe(false);
    expect(RichText.safeParse("   ").success).toBe(false);
    expect(RichText.safeParse([{ type: "text", text: "" }]).success).toBe(false);
    expect(RichText.safeParse("Participant").success).toBe(true);
  });

  it("rejects a card whose title or body says nothing", () => {
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", cards: [card("ok"), card([])] }).success).toBe(false);
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", cards: [card("ok"), { title: "t", body: "" }] }).success).toBe(false);
  });

  it("rejects cards that do not fill their columns", () => {
    // Five cards in four columns leaves a hole in the last row, which reads as a mistake because
    // it is one. This is the exact shape the generator produced.
    const five = [1, 2, 3, 4, 5].map(() => card("x"));
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", columns: 4, cards: five }).success).toBe(false);
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", columns: 5, cards: five }).success).toBe(true);
    // Full rows are fine, and so is a single row shorter than the column count.
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", columns: 2, cards: five.slice(0, 4) }).success).toBe(true);
    expect(deckWith({ id: "s", layout: "card-grid", heading: "H", columns: 3, cards: five.slice(0, 2) }).success).toBe(true);
  });
});
