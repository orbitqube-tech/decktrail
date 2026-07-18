import { describe, it, expect } from "vitest";
import { Deck, type Theme } from "@decktrail/ir";
import { renderStandalone } from "./index.js";
import { coverLogo, brandMark } from "./logo.js";

function themeWith(logo: { src: string; glow?: string }): Theme {
  return {
    name: "t",
    colors: { bg: "#0e0e0e", surfaceLow: "#131313", surfaceHigh: "#201f1f", accent: "#8ff5ff", accentDim: "#00eefc", accent2: "#ec63ff", accent2Dim: "#c600e3", text: "#c6c4c4", heading: "#f5f5f5", muted: "#8b8988" },
    typography: { family: "Inter", scale: 1 },
    logo,
  };
}

const deck = Deck.parse({
  id: "d", title: "Deck", slug: "deck", workspace: "w", kind: "slide-deck",
  slides: [
    { id: "cover", layout: "cover", heading: [{ type: "text", text: "Hi" }] },
    { id: "body", layout: "bullets", heading: [{ type: "text", text: "Points" }], items: [[{ type: "text", text: "a" }]] },
  ],
});

describe("coverLogo and brandMark", () => {
  it("render nothing when the theme has no logo (brand-neutral default)", () => {
    const t = themeWith({ src: "" });
    expect(coverLogo(t)).toBe("");
    expect(brandMark(t, true)).toBe("");
  });

  it("emit the image and apply the glow when set", () => {
    const t = themeWith({ src: "https://x/logo.png", glow: "#8ff5ff" });
    expect(coverLogo(t)).toContain('src="https://x/logo.png"');
    expect(coverLogo(t)).toContain("drop-shadow(0 0 12px #8ff5ff)");
    expect(brandMark(t, true)).toContain("dtbrand up");
  });

  it("escape the src", () => {
    expect(coverLogo(themeWith({ src: '"><script>' }))).not.toContain("<script>");
  });

  it("sets the company's name beside the mark when the theme names one", () => {
    // A logo alone is recognised by people who already know you, which on a deck sent to a new
    // client is nobody. The hand-built decks pair the two.
    const t = themeWith({ src: "https://x/logo.png" });
    t.logo.wordmark = "OrbitQube";
    const html = coverLogo(t);
    expect(html).toContain('class="dtcover"');
    expect(html).toContain(">OrbitQube<");
    // And it names the image, rather than leaving a reader who cannot see it with nothing.
    expect(html).toContain('alt="OrbitQube"');
  });

  it("escapes the wordmark", () => {
    const t = themeWith({ src: "https://x/logo.png" });
    t.logo.wordmark = '<script>x</script>';
    expect(coverLogo(t)).not.toContain("<script>");
  });
});

describe("logo in a rendered deck", () => {
  it("places the logo on the cover and in the bar, only when the theme carries one", () => {
    // A deck has a bar, so its mark goes in it, beside the deck's name, as the hand-built decks
    // do. brandMark's floating dtbrand stays for documents and tools, which have no bar.
    const withLogo = renderStandalone(deck, themeWith({ src: "logo.png" }));
    expect(withLogo).toContain('class="dtlogo"');
    expect(withLogo).toContain('class="dtbarmark"');
    // The element, not the stylesheet: logoCss still carries the .dtbrand rule for documents.
    expect(withLogo).not.toContain('<div class="dtbrand');

    const neutral = renderStandalone(deck, themeWith({ src: "" }));
    expect(neutral).not.toContain("dtlogo");
    expect(neutral).not.toContain("dtbarmark");
  });

  it("puts the cover logo only on the cover slide", () => {
    const html = renderStandalone(deck, themeWith({ src: "logo.png" }));
    // Exactly one hero logo (the cover), plus the one persistent footer mark.
    expect(html.match(/class="dtlogo"/g)?.length).toBe(1);
  });
});
