import { describe, it, expect } from "vitest";
import { runValidate, runRender, pushArtifact, publishAndShare, fetchVoice, extractBrand, fetchBrand, stylesheetUrls } from "./index.js";

const deck = {
  id: "d",
  title: "Proposal",
  slug: "proposal",
  workspace: "acme",
  kind: "slide-deck",
  slides: [
    { id: "s1", layout: "bullets", heading: [{ type: "text", text: "Heading" }], items: [[{ type: "text", text: "one" }]] },
  ],
};

describe("studio validate", () => {
  it("accepts a valid deck", () => {
    expect(runValidate(deck)).toEqual({ ok: true, kind: "slide-deck" });
  });
  it("rejects an invalid object", () => {
    expect(runValidate({ nope: true }).ok).toBe(false);
  });
});

describe("studio render", () => {
  it("renders a deck to standalone HTML", () => {
    const html = runRender(deck);
    expect(html).toContain("<!doctype html");
    expect(html).toContain("Heading");
  });

  it("marks a deck confidential by default, because that is the common case", () => {
    expect(runRender(deck)).toContain("Private &amp; Confidential");
  });

  it("drops the confidentiality label when it is explicitly null", () => {
    // A deck meant to be public: a talk, a portfolio piece, a marketing deck. Without this
    // the only way to render one was to bypass the CLI and write a script.
    const html = runRender(deck, undefined, { confidentialLabel: null });
    expect(html).not.toContain("Private &amp; Confidential");
    expect(html).toContain("Heading");
  });

  it("replaces the confidentiality label with custom text", () => {
    const html = runRender(deck, undefined, { confidentialLabel: "Under NDA" });
    expect(html).toContain("Under NDA");
    expect(html).not.toContain("Private &amp; Confidential");
  });

  it("keeps the default when no label option is passed at all", () => {
    // An absent key must not be forwarded as an explicit undefined, or the renderer's own
    // default would be overwritten with nothing.
    expect(runRender(deck, undefined, {})).toContain("Private &amp; Confidential");
  });

  it("applies the label option to a pricing tool too", () => {
    const tool = {
      id: "t", title: "Commercials", slug: "commercials", workspace: "acme",
      kind: "tool", tool: "pricing",
      lines: [{ description: "Build", offerPrice: 1000 }],
      locale: { currency: "INR" },
    };
    expect(runRender(tool, undefined, { confidentialLabel: null })).not.toContain("Private &amp; Confidential");
    expect(runRender(tool)).toContain("Private &amp; Confidential");
  });
});

describe("studio push", () => {
  it("posts the IR to the portal publish endpoint with a bearer token", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return {
        ok: true,
        status: 201,
        json: async () => ({ artifactId: "art_1", versionId: "ver_1", version: 1 }),
      } as Response;
    }) as unknown as typeof fetch;

    const res = await pushArtifact("http://portal.test/", "tok", { slug: "x" }, { fetch: fakeFetch });
    expect(res.artifactId).toBe("art_1");
    expect(captured.url).toBe("http://portal.test/admin/publish");
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
  });
});

describe("publish and share", () => {
  // The bug this guards, found by pushing a real deck: publish stores the artifact under the
  // IR's own workspace, but the share call defaulted to "default". Pushing any IR whose
  // workspace was not literally "default" published fine and then 404'd on the share, so
  // `push --recipient` was broken for every real deck.
  function recorder() {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return {
        ok: true,
        status: 201,
        json: async () =>
          String(url).endsWith("/admin/shares")
            ? { shareId: "shr_1", url: "https://portal.test/d/shr_1" }
            : { artifactId: "art_1", versionId: "ver_1", version: 1 },
      } as Response;
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it("shares under the IR's own workspace, not the default", async () => {
    const { calls, fetchImpl } = recorder();
    const ir = { slug: "orbitqube-introduction", workspace: "orbitqube", kind: "slide-deck" };
    const out = await publishAndShare("http://portal.test", "tok", ir, {
      recipient: "user@decktrail.orbitqube",
      fetch: fetchImpl,
    });

    const share = calls.find((c) => c.url.endsWith("/admin/shares"));
    expect(share?.body).toMatchObject({
      slug: "orbitqube-introduction",
      workspace: "orbitqube",
      recipient: "user@decktrail.orbitqube",
    });
    expect(out.share?.shareId).toBe("shr_1");
  });

  it("does not call the share endpoint without a recipient", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await publishAndShare("http://portal.test", "tok", { slug: "x", workspace: "w" }, { fetch: fetchImpl });
    expect(calls.map((c) => c.url)).toEqual(["http://portal.test/admin/publish"]);
    expect(out.share).toBeUndefined();
  });

  it("forwards the theme to publish", async () => {
    const { calls, fetchImpl } = recorder();
    await publishAndShare("http://portal.test", "tok", { slug: "x", workspace: "w" }, {
      theme: { name: "OrbitQube" },
      fetch: fetchImpl,
    });
    expect(calls[0]?.body).toMatchObject({ theme: { name: "OrbitQube" } });
  });
});

describe("brand extraction", () => {
  it("pulls accent, font, and logo from HTML", () => {
    const html = `<!doctype html><html><head>
<meta name="theme-color" content="#ff6600">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700">
<link rel="icon" href="/favicon.png">
<style>:root{--accent:#123456;--bg:#0a0a0a}</style>
</head><body></body></html>`;
    const theme = extractBrand(html, "https://acme.example");
    expect(theme.colors.accent).toBe("#123456"); // the CSS variable overrides the theme-color meta
    expect(theme.colors.bg).toBe("#0a0a0a");
    expect(theme.typography.family).toBe("Space Grotesk");
    expect(theme.logo.src).toBe("https://acme.example/favicon.png");
  });

  it("falls back to neutral tokens when nothing is found", () => {
    const theme = extractBrand("<html><head></head><body></body></html>");
    expect(theme.colors.heading).toBe("#f4f4f4"); // neutral default retained
  });

  it("reads common alias names for colour roles", () => {
    const css = ":root{--ink:#111111;--brand:#ff0000;--surface-1:#222222;--secondary:#00ff00}";
    const theme = extractBrand(`<style>${css}</style>`);
    expect(theme.colors.text).toBe("#111111"); // ink
    expect(theme.colors.accent).toBe("#ff0000"); // brand
    expect(theme.colors.surfaceLow).toBe("#222222"); // surface-1
    expect(theme.colors.accent2).toBe("#00ff00"); // secondary
  });

  it("infers the accent from what links are painted with, when no name matches", () => {
    // A site that names its brand colour by hue tells us the job in its link rules instead.
    const css = `:root{--cyan:#8ff5ff;--ink:#ffffff;--muted:#adaaaa}
      .prose a{color:var(--cyan)}
      .nav a{color:var(--muted)}
      .nav a:hover{color:var(--ink)}
      .footer a{color:var(--cyan)}`;
    const theme = extractBrand(`<style>${css}</style>`);
    expect(theme.colors.accent).toBe("#8ff5ff"); // used twice; --muted and --ink are taken
  });

  it("does not infer an accent when the site names one", () => {
    const css = ":root{--accent:#ff0000;--cyan:#00ffff}a{color:var(--cyan)}";
    expect(extractBrand(`<style>${css}</style>`).colors.accent).toBe("#ff0000");
  });

  it("leaves the accent neutral when links say nothing useful", () => {
    const css = ":root{--ink:#ffffff}a{color:inherit}";
    expect(extractBrand(`<style>${css}</style>`).colors.accent).toBe("#7aa2ff"); // untouched default
  });

  it("does not mistake a class ending in -a for a link", () => {
    // The first cut of this used \ba\b, which matches ".active-a", ".foo-a" and "[data-a]".
    // A wrong accent is worse than none: it repaints every slide in a colour the site never
    // used for anything.
    const css = `:root{--wrong:#ff0000}
      .role-card.active-a{color:var(--wrong)}
      .foo-a{color:var(--wrong)}
      [data-a]{color:var(--wrong)}
      span.area{color:var(--wrong)}`;
    expect(extractBrand(`<style>${css}</style>`).colors.accent).toBe("#7aa2ff"); // untouched
  });

  it("still finds anchors in compound and descendant selectors", () => {
    const css = `:root{--c:#00ffcc}
      .prose a,.footer a{color:var(--c)}
      .nav > a:hover{color:var(--c)}`;
    expect(extractBrand(`<style>${css}</style>`).colors.accent).toBe("#00ffcc");
  });

  it("finds only same-origin stylesheets, and resolves them", () => {
    const html = `<html><head>
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<link rel="stylesheet" href="https://cdn.other.example/x.css">
<link rel="icon" href="/favicon.ico">
</head></html>`;
    expect(stylesheetUrls(html, "https://acme.example/")).toEqual(["https://acme.example/assets/css/site.css"]);
  });
});

describe("brand extraction over the network", () => {
  // The bug this guards: a real site keeps its colours in a linked stylesheet, not in the
  // HTML. Reading only the document found a favicon and nothing else, so every extraction
  // returned the neutral defaults and the "point it at your website" feature did nothing.
  function fakeSite(pages: Record<string, string>): typeof fetch {
    return (async (url: string) => {
      const body = pages[String(url)];
      return body === undefined
        ? ({ ok: false, status: 404, text: async () => "" } as Response)
        : ({ ok: true, status: 200, text: async () => body } as Response);
    }) as unknown as typeof fetch;
  }

  it("pulls colours out of a linked stylesheet", async () => {
    const theme = await fetchBrand(
      "https://acme.example/",
      fakeSite({
        "https://acme.example/": `<html><head><link rel="stylesheet" href="/site.css"></head></html>`,
        "https://acme.example/site.css": ":root{--bg:#0a0a0a;--brand:#8ff5ff;--ink:#ffffff}",
      }),
    );
    expect(theme.colors.bg).toBe("#0a0a0a");
    expect(theme.colors.accent).toBe("#8ff5ff");
    expect(theme.colors.text).toBe("#ffffff");
  });

  it("lets an inline value win over the stylesheet", async () => {
    const theme = await fetchBrand(
      "https://acme.example/",
      fakeSite({
        "https://acme.example/": `<html><head><link rel="stylesheet" href="/site.css"><style>:root{--brand:#111111}</style></head></html>`,
        "https://acme.example/site.css": ":root{--brand:#999999}",
      }),
    );
    expect(theme.colors.accent).toBe("#111111");
  });

  it("still extracts when a stylesheet 404s", async () => {
    const theme = await fetchBrand(
      "https://acme.example/",
      fakeSite({
        "https://acme.example/": `<html><head><link rel="stylesheet" href="/missing.css"><meta name="theme-color" content="#abcdef"></head></html>`,
      }),
    );
    expect(theme.colors.accent).toBe("#abcdef");
  });

  it("does not fetch third-party stylesheets", async () => {
    const asked: string[] = [];
    const spy = (async (url: string) => {
      asked.push(String(url));
      return { ok: true, status: 200, text: async () => "" } as Response;
    }) as unknown as typeof fetch;
    await fetchBrand("https://acme.example/", spy);
    expect(asked).toEqual(["https://acme.example/"]);
  });
});

describe("where the voice comes from", () => {
  // The console Voice tab wrote to a settings row and the CLI read voice.json from disk. They
  // never met: editing your tone in the console changed nothing, generation used a file on
  // whatever machine ran the CLI, and the tab claimed "new generations will use this voice".
  it("reads the workspace voice from the portal with the admin token", async () => {
    const seen = { url: "", auth: "" };
    const fakeFetch = (async (url, init) => {
      seen.url = String(url);
      seen.auth = (init.headers ?? {}).authorization;
      return { ok: true, status: 200, json: async () => ({ voice: { name: "Console Voice" } }) };
    });
    const v = await fetchVoice("http://portal.test/", "tok", fakeFetch);
    expect(seen.url).toBe("http://portal.test/admin/voice");
    expect(seen.auth).toBe("Bearer tok");
    expect(v).toEqual({ name: "Console Voice" });
  });

  it("returns null when the portal has no voice set, so a caller can fall back", async () => {
    const fakeFetch = (async () => ({ ok: true, status: 200, json: async () => ({ voice: null }) }));
    expect(await fetchVoice("http://portal.test", "tok", fakeFetch)).toBeNull();
  });

  it("throws when the portal refuses, rather than silently generating in the wrong voice", async () => {
    const fakeFetch = (async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(fetchVoice("http://portal.test", "bad", fakeFetch)).rejects.toThrow(/401/);
  });
});

describe("what render says when it cannot", () => {
  it("names the field at fault on a deck that says it is a deck", () => {
    // "not a slide deck, document, tool, or pack" is true of a 26-slide deck with one empty
    // card, and useless: it reads as though the file is the wrong kind of thing entirely. The
    // schema knows the path, so the author gets it.
    const broken = {
      id: "d", title: "T", slug: "t", workspace: "w", kind: "slide-deck",
      slides: [{ id: "s", layout: "card-grid", heading: "H", cards: [{ title: "ok", body: "b" }, { title: [], body: [] }] }],
    };
    expect(() => runRender(broken)).toThrow(/cannot render this slide-deck/);
    expect(() => runRender(broken)).toThrow(/slides\.0\.cards\.1\.title/);
  });

  it("still says so plainly when the input is not an artifact at all", () => {
    expect(() => runRender({ hello: "world" })).toThrow(/not a slide deck, document, tool, or pack/);
  });
});
