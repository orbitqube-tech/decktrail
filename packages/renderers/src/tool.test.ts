import { describe, it, expect } from "vitest";
import { Tool, type Theme, type WatermarkConfig } from "@decktrail/ir";
import { renderTool, renderPortalTool } from "./index.js";

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

/** A tool with two included groups (so subtotals show), a discounted line, and one
 *  excluded optional line. presenterMode is on to prove the portal still locks it. */
const tool = Tool.parse({
  id: "t",
  title: "Commercials",
  slug: "commercials",
  workspace: "orbitqube",
  kind: "tool",
  tool: "pricing",
  lines: [
    { description: [{ type: "text", text: "MVP build" }], listPrice: 300000, offerPrice: 250000, group: "Core" },
    { description: [{ type: "text", text: "Care plan" }], offerPrice: 40000, group: "Support" },
    { description: [{ type: "text", text: "WhatsApp channel" }], offerPrice: 60000, include: false, group: "Optional" },
  ],
  notes: [[{ type: "text", text: "Third-party subscriptions are billed at actuals." }]],
  presenterMode: true,
  locale: { currency: "INR" },
});

const watermark: WatermarkConfig = {
  fields: ["recipient", "label"],
  template: "{recipient} {label}",
  label: "Confidential",
  opacity: 0.16,
  tiling: {},
};

describe("pricing-tool renderer", () => {
  it("renders a full HTML document with the title", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Commercials</title>");
    expect(html).toContain("</html>");
  });

  it("applies the theme as CSS variables", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).toContain("--accent:#8ff5ff");
  });

  it("formats the total in the tool's currency with Indian grouping", () => {
    const html = renderTool(tool, theme, { presenter: false });
    // 250000 + 40000 = 290000, excluded WhatsApp line is not counted.
    expect(html).toContain("2,90,000");
    expect(html).toContain("₹"); // rupee sign
  });

  it("shows a subtotal per group when there is more than one group", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).toContain("Core subtotal");
    expect(html).toContain("Support subtotal");
  });

  it("shows the struck list price on a discounted line", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).toContain("3,00,000"); // listPrice, struck through
    expect(html).toContain('class="list"');
  });

  it("omits an excluded line from the locked client view", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).not.toContain("WhatsApp channel");
  });

  it("emits no editing control in the locked view", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).not.toContain('id="dtdata"');
    expect(html).not.toContain("Add line");
    expect(html).not.toContain("editbar");
    expect(html).not.toContain("<input");
  });

  it("carries the confidential and made-with marks by default", () => {
    const html = renderTool(tool, theme, { presenter: false });
    expect(html).toContain("Private &amp; Confidential");
    expect(html).toContain("Made with ");
    expect(html).toContain(">DeckTrail</a> by <a");
    expect(html).toContain(">OrbitQube</a>");
  });

  it("emits the interactive surface in presenter mode", () => {
    const html = renderTool(tool, theme, { presenter: true });
    expect(html).toContain('id="dtdata"');
    expect(html).toContain("Add line");
    expect(html).toContain("Press E to edit");
    // The presenter data carries every line, including the excluded one, for live editing.
    expect(html).toContain("WhatsApp channel");
  });

  it("defaults to the artifact's own presenterMode", () => {
    const html = renderTool(tool, theme); // presenterMode is true on this fixture
    expect(html).toContain('id="dtdata"');
  });

  it("locks the tool when served through the portal, even if presenterMode is on", () => {
    const html = renderPortalTool(tool, theme, watermark, { recipient: "client@example.com" });
    expect(html).not.toContain('id="dtdata"');
    expect(html).not.toContain("Add line");
    // The per-viewer watermark and anti-copy friction are present.
    expect(html).toContain("client@example.com");
    expect(html).toContain("dtprotect");
    expect(html).toContain("#dtwm");
  });

  it("formats a foreign-currency tool to its own convention", () => {
    const usd = Tool.parse({
      id: "t2",
      title: "Quote",
      slug: "quote",
      workspace: "w",
      kind: "tool",
      tool: "pricing",
      lines: [{ description: [{ type: "text", text: "Build" }], offerPrice: 1000 }],
      locale: { currency: "USD" },
    });
    const html = renderTool(usd, theme, { presenter: false });
    expect(html).toContain("$1,000");
  });

  it("emits no em dash anywhere in the output", () => {
    const presenter = renderTool(tool, theme, { presenter: true });
    const locked = renderTool(tool, theme, { presenter: false });
    const emDash = String.fromCharCode(0x2014); // em dash, kept out of source as a literal
    expect(presenter).not.toContain(emDash);
    expect(locked).not.toContain(emDash);
  });
});
