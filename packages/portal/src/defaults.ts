import type { Theme, WatermarkConfig } from "@decktrail/ir";

/**
 * A neutral built-in theme. Per-artifact themes (D16) are wired later; this is the
 * fallback so the portal can serve content in Wave 1. It is deliberately not OrbitQube.
 */
export const defaultTheme: Theme = {
  name: "DeckTrail Neutral",
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

/** The default brand name, used in emails when the self-hoster has not set brand_name. */
export const defaultBrandName = "DeckTrail";

/**
 * Where someone asks permission to use the DeckTrail or OrbitQube names (D19, D20,
 * TRADEMARK.md). This is not about the attribution mark: removing that needs no permission at
 * all. This is for naming a fork DeckTrail, using the logos, or offering a hosted service
 * under the name. The primary path opens a pre-filled request on the project's issue tracker,
 * so the requester signs in with their own account and needs no project membership. The email
 * is the fallback for anyone who would rather not use the tracker.
 */
export const trademarkRequestUrl =
  "https://gitlab.com/orbitqube/solutions/decktrail/-/issues/new?issuable_template=trademark-permission";
export const trademarkFallbackEmail = "info@orbitqube.com";

/** A sensible default per-viewer watermark (D14); the self-hoster overrides it. */
export const defaultWatermark: WatermarkConfig = {
  fields: ["recipient", "timestamp", "label"],
  template: "{recipient} · {timestamp} · {label}",
  label: "Confidential",
  opacity: 0.16,
  tiling: {},
};
