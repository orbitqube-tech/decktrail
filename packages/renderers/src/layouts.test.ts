import { describe, it, expect } from "vitest";
import { layouts, layoutCss, layoutNames, isLayoutName } from "./layouts.js";
import { renderStandalone } from "./index.js";
import type { Deck, Theme } from "@decktrail/ir";

const theme: Theme = {
  name: "Fixture",
  colors: {
    bg: "#0e0e0e",
    surfaceLow: "#141414",
    surfaceHigh: "#1e1e1e",
    accent: "#7aa2ff",
    accentDim: "#5b83e6",
    accent2: "#b98cff",
    accent2Dim: "#9a68e6",
    text: "#c9c9c9",
    heading: "#f4f4f4",
    muted: "#8a8a8a",
  },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "" },
};

// Rich text reaches the renderer as run arrays, because the schema expands a bare string into
// runs at parse time and the renderer is handed the parsed shape. Written out here rather than
// parsed, to match the other renderer tests and to keep this file free of schema concerns.
const deck: Deck = {
  id: "layout-fixture",
  title: "Layout fixture",
  slug: "layout-fixture",
  workspace: "acme",
  kind: "slide-deck",
  slides: [
    {
      id: "s1",
      layout: "cover",
      heading: [{ type: "text", text: "Layout fixture" }],
      sub: [{ type: "text", text: "For Acme" }],
    },
    {
      id: "s2",
      layout: "bullets",
      heading: [{ type: "text", text: "Points" }],
      items: [[{ type: "text", text: "One" }], [{ type: "text", text: "Two" }]],
    },
  ],
};

describe("the layouts that ship", () => {
  it("names four layouts", () => {
    expect(layoutNames).toEqual(["crest", "editorial", "storybook", "vivid"]);
  });

  it("recognises a name whatever case it was typed in, and rejects one it does not have", () => {
    expect(isLayoutName("Crest")).toBe(true);
    expect(isLayoutName("  VIVID ")).toBe(true);
    expect(isLayoutName("brutalist")).toBe(false);
  });

  // Naming nothing must give back the shell exactly. The whole point of adding layouts is to
  // widen the choice, not to move the floor, so this is the test that pins the floor.
  it("adds nothing at all when no layout is named", () => {
    expect(layoutCss()).toBe("");
    expect(layoutCss(null)).toBe("");
    expect(layoutCss("")).toBe("");
    expect(renderStandalone(deck, theme)).toBe(renderStandalone(deck, theme, { layout: null }));
  });

  it("returns the shell unchanged for a name it does not know, rather than throwing mid publish", () => {
    expect(layoutCss("brutalist")).toBe("");
    expect(renderStandalone(deck, theme, { layout: "brutalist" })).toBe(renderStandalone(deck, theme));
  });

  for (const name of Object.keys(layouts)) {
    describe(name, () => {
      const css = layouts[name as keyof typeof layouts];

      it("is substantial enough to be a layout rather than a tweak", () => {
        expect(css.length).toBeGreaterThan(1500);
        expect(css.split("{").length - 1).toBeGreaterThan(30);
      });

      it("reaches the rendered deck", () => {
        const html = renderStandalone(deck, theme, { layout: name });
        expect(html).not.toBe(renderStandalone(deck, theme));
        expect(html).toContain(css.trim().slice(0, 60).trim().split("\n")[0].trim() || "");
      });

      // HARD RULE 1. A layout that names its own colour cannot be worn by another theme, and
      // this project's standing rule is one authoritative home per value. Neutral black and
      // white at low alpha are allowed, because a hairline and a shadow are not palette.
      it("names no palette colour, so it composes with any theme", () => {
        const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(withoutComments.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
        const fns = withoutComments.match(/\b(?:rgba?|hsla?)\([^)]*\)/g) ?? [];
        const nonNeutral = fns.filter((f) => !/\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,)]/.test(f));
        expect(nonNeutral).toEqual([]);
      });

      // HARD RULE 2. `.slide{display:none}` and `.slide.active{display:flex}` are how the deck
      // shows one slide at a time. A layout that overrides them stops navigation working, and
      // the deck would still look fine in a screenshot, which is what makes it worth a test.
      it("leaves slide visibility to the shell, so navigation keeps working", () => {
        const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const m of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
          const selector = m[1].trim();
          if (!/\.slide\b/.test(selector)) continue;
          // A descendant of a slide is fine; the slide box itself is not.
          if (!/\.slide(?:\.active)?\s*(?:,|$)/.test(selector.split(",").find((s) => /\.slide\b/.test(s)) ?? "")) {
            continue;
          }
          expect(m[2]).not.toMatch(/(?:^|;)\s*(?:display|position|inset)\s*:/);
        }
      });

      it("carries no em dash, per the house rule", () => {
        expect(css).not.toContain("—");
      });
    });
  }
});
