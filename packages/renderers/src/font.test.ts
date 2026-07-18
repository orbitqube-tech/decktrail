import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fontFaceCss, fontSlug, clearFontCache, renderStandalone } from "./index.js";
import type { Deck, Theme } from "@decktrail/ir";

// The real cache directory, resolved the way font.ts resolves it: a test pointing at a directory
// of its own would prove only that it could read a file it had just written.
//
// So these write into the real one, and therefore only ever under a family nobody would fetch.
// Writing "Inter" here would overwrite the fetched font and then delete it on cleanup, which is
// what the first version of this file did: running the tests silently un-installed the webfont
// and every deck rendered afterwards fell back to the system face.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const FAKE = "Decktrail Test Face";
const written: string[] = [];

function cacheAFont(family: string, css: string): void {
  if (fontSlug(family) === fontSlug("Inter")) throw new Error("refusing to overwrite a real fetched font");
  mkdirSync(DIR, { recursive: true });
  const p = join(DIR, `${fontSlug(family)}.css`);
  writeFileSync(p, css);
  written.push(p);
  clearFontCache();
}

afterEach(() => {
  for (const p of written.splice(0)) rmSync(p, { force: true });
  clearFontCache();
});

const theme: Theme = {
  name: "t",
  colors: {
    bg: "#0e0e0e", surfaceLow: "#131313", surfaceHigh: "#201f1f", accent: "#8ff5ff", accentDim: "#00eefc",
    accent2: "#ec63ff", accent2Dim: "#c600e3", text: "#c6c4c4", heading: "#f5f5f5", muted: "#8b8988",
  },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "" },
};
const deck: Deck = {
  id: "d", title: "T", slug: "t", workspace: "acme", kind: "slide-deck",
  slides: [{ id: "s1", layout: "cover", heading: [{ type: "text", text: "Hi" }] }],
};

describe("the fetched webfont", () => {
  it("agrees with the fetch script on where a family is cached", () => {
    // The script writes <slug>.css and this reads it. They are two files that must not drift.
    expect(fontSlug("Inter")).toBe("inter");
    expect(fontSlug("Source Sans 3")).toBe("source-sans-3");
    expect(fontSlug("  IBM Plex Sans  ")).toBe("ibm-plex-sans");
  });

  it("returns the cached rules for a family that has been fetched", () => {
    cacheAFont(FAKE, `@font-face{font-family:'${FAKE}';src:url(data:font/woff2;base64,AAA)}`);
    expect(fontFaceCss(FAKE)).toContain("@font-face");
    expect(fontFaceCss(FAKE)).toContain(FAKE);
  });

  it("returns nothing for a family nobody fetched, rather than failing", () => {
    // A missing font is not a reason to fail a render: the deck falls back to the system face.
    expect(fontFaceCss("Nothing Fetched Here")).toBe("");
    expect(fontFaceCss("")).toBe("");
  });

  it("does not let a family name escape the cache directory", () => {
    // The family comes from a theme, and a theme can come from the console.
    expect(fontFaceCss("../../../../etc/passwd")).toBe("");
    expect(fontSlug("../../etc/passwd")).toBe("etc-passwd");
  });
});

describe("what a renderer does with it", () => {
  it("embeds the CSS it is given", () => {
    const html = renderStandalone(deck, theme, { fontCss: "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,ZZZ)}" });
    expect(html).toContain("@font-face");
    expect(html).toContain("base64,ZZZ");
  });

  it("renders the same HTML whether or not a font sits on the disk", () => {
    // The point of passing fontCss in. If the renderer read the cache itself, its output would
    // depend on what the machine happened to have, and every test here would agree with the
    // machine rather than with the code. This repository has shipped that failure before.
    const t: Theme = { ...theme, typography: { family: FAKE, scale: 1 } };
    const before = renderStandalone(deck, t);
    cacheAFont(FAKE, `@font-face{font-family:'${FAKE}';src:url(data:font/woff2;base64,QQQ)}`);
    const after = renderStandalone(deck, t);
    expect(after).toBe(before);
    expect(after).not.toContain("@font-face");
  });

  it("never points a deck at a font CDN", () => {
    // The whole reason for fetching at deploy: a client opening a confidential deck must not
    // announce it to a third party.
    const html = renderStandalone(deck, theme, { fontCss: fontFaceCss("Inter") });
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
