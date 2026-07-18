import { describe, it, expect } from "vitest";
import { Deck, type Theme, type WatermarkConfig } from "@decktrail/ir";
import { renderStandalone } from "./index.js";
import { renderPortalDeck } from "./portal.js";
import { beaconConfigTag } from "./beacon.js";

const theme: Theme = {
  name: "t",
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
  logo: { src: "" },
};

const deck = Deck.parse({
  id: "d",
  title: "Deck",
  slug: "deck",
  workspace: "w",
  kind: "slide-deck",
  slides: [
    { id: "s1", layout: "cover", heading: [{ type: "text", text: "Hello" }] },
    { id: "s2", layout: "bullets", heading: [{ type: "text", text: "Points" }], items: [[{ type: "text", text: "a" }]] },
  ],
});

const watermark: WatermarkConfig = { fields: ["recipient"], template: "{recipient}", label: "Confidential", opacity: 0.16, tiling: {} };
const beacon = { endpoint: "/e", artifactId: "art_1", versionId: "ver_1" };

describe("beaconConfigTag", () => {
  it("embeds the config and escapes an angle bracket in a value", () => {
    const tag = beaconConfigTag(beacon);
    expect(tag).toContain('"artifactId":"art_1"');
    expect(tag).toContain('"endpoint":"/e"');
    // A value carrying a script-close sequence cannot break out: its < is escaped.
    const evil = beaconConfigTag({ endpoint: "/e", artifactId: "</script>", versionId: "v" });
    expect(evil).toContain("\\u003c/script");
  });
});

describe("beacon injection", () => {
  it("a standalone file never phones home", () => {
    const html = renderStandalone(deck, theme);
    expect(html).not.toContain("dtbeacon");
    expect(html).not.toContain("sendBeacon");
  });

  it("the portal-served deck carries the beacon and its config", () => {
    const html = renderPortalDeck(deck, theme, watermark, { recipient: "c@acme.com" }, { beacon });
    expect(html).toContain('id="dtbeacon"');
    expect(html).toContain('"artifactId":"art_1"');
    expect(html).toContain('"versionId":"ver_1"');
    expect(html).toContain("navigator.sendBeacon");
    // The slides it tracks carry their ids.
    expect(html).toContain('data-slide-id="s1"');
  });

  it("emits no em dash in the beacon output", () => {
    const html = renderPortalDeck(deck, theme, watermark, { recipient: "c@acme.com" }, { beacon });
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});
