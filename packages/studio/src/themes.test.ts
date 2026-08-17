import { describe, it, expect } from "vitest";
import { Theme } from "@decktrail/ir";
import { themes, themeNames, builtInTheme, neutralTheme, resolveTheme, type ThemeIo } from "./themes.js";
import { runRender } from "./commands.js";

const deck = {
  id: "theme-fixture",
  title: "Theme fixture",
  slug: "theme-fixture",
  workspace: "acme",
  kind: "slide-deck",
  slides: [{ id: "s1", layout: "cover", heading: "Theme fixture", sub: "For Acme" }],
};

describe("themes that ship with DeckTrail", () => {
  it("names four themes, one per layout", () => {
    expect(themeNames).toEqual(["crest", "editorial", "storybook", "vivid"]);
  });

  // storybook and vivid come from one warm family and must not collapse into the same theme.
  it("keeps storybook and vivid distinct", () => {
    expect(themes.storybook.colors).not.toEqual(themes.vivid.colors);
    expect(themes.storybook.colors.accent).not.toBe(themes.vivid.colors.accent);
    expect(themes.storybook.colors.accent2).not.toBe(themes.vivid.colors.accent2);
  });

  // The real guard. These palettes were transcribed by hand from stylesheets, and a mistyped
  // hex is invisible until somebody renders with it. The schema is what catches it.
  for (const name of Object.keys(themes)) {
    it(`${name} satisfies the IR theme schema`, () => {
      const parsed = Theme.safeParse(themes[name]);
      expect(parsed.success ? null : parsed.error.issues).toBeNull();
    });
  }

  it("looks a theme up by name, whatever case it was typed in", () => {
    expect(builtInTheme("crest")).toBe(themes.crest);
    expect(builtInTheme("Crest")).toBe(themes.crest);
    expect(builtInTheme("  EDITORIAL ")).toBe(themes.editorial);
  });

  it("returns nothing for a name it does not ship, so the caller can try a path", () => {
    expect(builtInTheme("brutalist")).toBeUndefined();
    expect(builtInTheme("./my-theme.json")).toBeUndefined();
    expect(builtInTheme("")).toBeUndefined();
  });

  // Adding themes must not have moved the floor. A render that names no theme is still neutral.
  it("leaves the neutral theme as the default", () => {
    expect(themeNames).not.toContain("neutral");
    expect(neutralTheme.name).toBe("DeckTrail Neutral");
    expect(runRender(deck)).toContain(neutralTheme.colors.accent);
  });

  it("puts a named theme's own colours into the rendered output", () => {
    for (const name of Object.keys(themes)) {
      const html = runRender(deck, themes[name]);
      expect(html).toContain(themes[name].colors.accent);
      expect(html).toContain(themes[name].colors.bg);
      expect(html).not.toContain(neutralTheme.colors.bg);
    }
  });

  // A theme is colour and type. If a theme ever starts carrying layout, this is the test that
  // should be argued with rather than quietly deleted.
  it("changes only colour and type, never the markup", () => {
    const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "");
    expect(strip(runRender(deck, themes.crest))).toBe(strip(runRender(deck, themes.vivid)));
  });
});

describe("resolving what --theme was given", () => {
  // A filesystem that holds exactly the paths it is told about, so each case states its own world.
  const io = (files: Record<string, string>): ThemeIo => ({
    exists: (p) => p in files,
    read: (p) => files[p],
    parse: (v) => Theme.parse(v),
  });
  const onDisk = JSON.stringify({ ...themes.crest, name: "From a file" });

  it("reads a path when the path exists", () => {
    const t = resolveTheme("brand/mine.json", io({ "brand/mine.json": onDisk }));
    expect(t?.name).toBe("From a file");
  });

  it("takes a built-in by name when no such path exists", () => {
    expect(resolveTheme("vivid", io({}))).toBe(themes.vivid);
  });

  // The precedence that stops a future built-in from hijacking somebody's existing file.
  it("prefers an existing file over a built-in of the same name", () => {
    const t = resolveTheme("crest", io({ crest: onDisk }));
    expect(t?.name).toBe("From a file");
    expect(t).not.toBe(themes.crest);
  });

  it("falls back to theme.json when no theme was named", () => {
    expect(resolveTheme(undefined, io({ "theme.json": onDisk }))?.name).toBe("From a file");
  });

  it("resolves to nothing when nothing was named and no theme.json is there", () => {
    expect(resolveTheme(undefined, io({}))).toBeUndefined();
  });

  it("says what the choices are when the argument is neither a path nor a name", () => {
    expect(() => resolveTheme("stroybook", io({}))).toThrow(/crest, editorial, storybook, vivid/);
  });
});
