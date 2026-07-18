import { describe, it, expect } from "vitest";
import type { Deck, Theme } from "@decktrail/ir";
import { renderStandalone, renderInline, escapeHtml } from "./index.js";

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

const deck: Deck = {
  id: "d",
  title: "Proposal",
  slug: "proposal",
  workspace: "acme",
  kind: "slide-deck",
  slides: [
    { id: "s1", layout: "cover", heading: [{ type: "text", text: "Hello" }] },
    {
      id: "s2",
      layout: "bullets",
      heading: [{ type: "text", text: "Points" }],
      items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]],
      callout: { body: [{ type: "text", text: "a note" }], tone: "green" },
    },
    {
      id: "s3",
      layout: "table",
      heading: [{ type: "text", text: "Stack" }],
      columns: [[{ type: "text", text: "Area" }], [{ type: "text", text: "Choice" }]],
      rows: [[[{ type: "text", text: "Database" }], [{ type: "text", text: "PostgreSQL" }]]],
    },
  ],
};

describe("the deck chrome, against the hand-built decks it is meant to match", () => {
  const html = () => renderStandalone(deck, theme);

  it("does not advance the deck when the reader clicks it", () => {
    // It used to advance on any click past the halfway line, which meant a client could not
    // select a sentence without the slide changing under them. A deck is read, not clicked.
    expect(html()).not.toContain("innerWidth/2");
  });

  it("gives the reader a way to reach slide 19 without pressing the arrow 19 times", () => {
    const h = html();
    expect(h).toContain("jumpmenu");
    expect(h).toContain("Jump to a slide");
    // The counter is the handle. It had the pointer cursor for it and no handler behind it.
    expect(h).toMatch(/counter.*addEventListener\('click'/s);
  });

  it("puts the slide in the address, so a deck can be linked at the slide worth reading", () => {
    const h = html();
    expect(h).toContain("hashchange");
    expect(h).toMatch(/location\.hash/);
    // replaceState, so passing through twelve slides does not leave twelve entries behind the
    // reader's back button.
    expect(h).toContain("history.replaceState");
    expect(h).not.toMatch(/location\.hash\s*=/);
  });

  it("says how to get back out of the jump menu", () => {
    // Escape and a click on the backdrop both closed it, and neither was written anywhere, so
    // the only visible way back to the slide you were reading was to find it in the grid again.
    const h = html();
    expect(h).toContain("Back to the slide");
    expect(h).toContain("jback");
  });

  /** One cell of the bar, so an assertion about it cannot quietly match the cell next door. */
  const cell = (h: string, name: string) =>
    h.match(new RegExp(`<div class="${name}">((?:(?!<div class=)[\\s\\S])*?)</div>\\n?<div class=|<div class="${name}">([\\s\\S]*?)</div>\\n</div>`))?.slice(1).find(Boolean) ?? "";

  it("puts the made-with mark left, the deck's name centre, and the way through right", () => {
    const h = html();
    // Each thing in its own cell. An earlier version of this test used .* with the s flag, which
    // spans newlines, so "b-left ... Proposal" matched straight across three cells and passed
    // while the title actually sat in the middle one.
    expect(cell(h, "b-left")).toContain("madewith");
    expect(cell(h, "b-left")).not.toContain("Proposal");
    expect(cell(h, "b-mid")).toContain("Proposal");
    expect(cell(h, "b-mid")).toContain("dtbarmark");
    expect(cell(h, "b-right")).toContain('id="counter"');
    // The arrows must be adjacent, and in the same cell: the reader reaches for them in one place.
    expect(cell(h, "b-right")).toMatch(/id="prev"[\s\S]{0,120}id="next"/);
  });

  it("lets the bar's cells shrink rather than run through each other", () => {
    // Without minmax(0,...) a cell wider than its share overflows into its neighbour: the
    // made-with mark ran straight through the deck's title in any half-width window.
    const h = html();
    expect(h).toMatch(/\.bar-nav\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,auto\) minmax\(0,1fr\)/);
    expect(h).toMatch(/\.bar-nav \.b-mid \.t,\.bar-nav \.b-left \.madewith\{[^}]*text-overflow:ellipsis/);
  });

  it("puts the logo and the made-with mark in the bar, not floating over it", () => {
    const h = html();
    // Two fixed things laying claim to the same corner can only collide, which is what the
    // floating mark did with the arrows, and then with the deck's own name once it moved.
    expect(h).not.toContain('<div class="dtbrand');
    expect(h).not.toContain('class="madewith up"');
  });

  it("measures the bullet on the bullet, not on the list around it", () => {
    // A ch unit resolves against the element's own font-size. The measure sat on the ul, which
    // inherits the body's size, so the box was cut for 68 characters and filled with larger
    // text: 47 fitted. The vetted decks run to 76.
    const h = html();
    expect(h).toMatch(/ul\.points li\{[^}]*max-width:76ch/);
    expect(h).not.toMatch(/ul\.points\{[^}]*max-width/);
  });

  it("does not inflate the vetted type scale", () => {
    // 1.25 on top of a scale already larger than the hand-built decks took a 58px heading to
    // 78px, and everything below it wrapped to pay for it.
    expect(html()).toMatch(/--scale:1(;|})/);
  });
});

describe("standalone renderer", () => {
  it("renders a full HTML document", () => {
    const html = renderStandalone(deck, theme);
    expect(html.startsWith("<!doctype html")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Proposal</title>");
    expect(html).toContain("Hello");
  });

  it("renders one section per slide", () => {
    const html = renderStandalone(deck, theme);
    const count = (html.match(/class="slide"/g) ?? []).length;
    expect(count).toBe(3);
  });

  it("applies the theme as CSS variables", () => {
    const html = renderStandalone(deck, theme);
    expect(html).toContain("--accent:#8ff5ff");
  });

  it("emits no em dash anywhere in the framework output", () => {
    const html = renderStandalone(deck, theme);
    expect(html.includes("—")).toBe(false);
  });

  it("carries the confidential and made-with marks by default", () => {
    const html = renderStandalone(deck, theme);
    expect(html).toContain("Private &amp; Confidential");
    expect(html).toContain("Made with ");
    expect(html).toContain(">DeckTrail</a> by <a");
    expect(html).toContain(">OrbitQube</a>");
  });

  it("escapes HTML in content and renders highlight spans", () => {
    expect(escapeHtml('<b>&"')).toBe("&lt;b&gt;&amp;&quot;");
    expect(renderInline([{ type: "highlight", text: "x" }])).toContain('class="grad"');
  });
});
