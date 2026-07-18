import type { Deck, DocumentArtifact, Tool, Pack, Theme, WatermarkConfig } from "@decktrail/ir";
import { renderStandalone, type StandaloneOptions } from "./index.js";
import { renderDocument, type DocumentOptions } from "./document.js";
import { renderTool, type ToolOptions } from "./tool.js";
import { renderHub, type HubOptions } from "./hub.js";
import { watermarkText } from "./watermark.js";

/** Who is viewing, for the per-viewer watermark. */
export interface Viewer {
  recipient?: string;
  timestamp?: string;
}

/**
 * The `portal` renderer: the same artifact as the standalone output, plus a per-viewer
 * watermark injected at serve time and anti-copy friction. The watermark is the real
 * protection control (attribution), stated honestly in the threat model.
 */
export function renderPortalDeck(
  deck: Deck,
  theme: Theme,
  config: WatermarkConfig,
  viewer: Viewer,
  opts: StandaloneOptions = {},
): string {
  const text = watermarkText(config, { recipient: viewer.recipient, timestamp: viewer.timestamp, label: config.label });
  return renderStandalone(deck, theme, {
    ...opts,
    watermark: { text, opacity: config.opacity },
    protect: true,
  });
}

export function renderPortalDocument(
  doc: DocumentArtifact,
  theme: Theme,
  config: WatermarkConfig,
  viewer: Viewer,
  opts: DocumentOptions = {},
): string {
  const text = watermarkText(config, { recipient: viewer.recipient, timestamp: viewer.timestamp, label: config.label });
  return renderDocument(doc, theme, {
    ...opts,
    watermark: { text, opacity: config.opacity },
    protect: true,
  });
}

/**
 * Serve a pricing tool through the portal. Always locked: the interactive presenter
 * controls are never emitted to a client, so the recipient sees the agreed figures with
 * the per-viewer watermark and anti-copy friction, and no way to edit them.
 */
export function renderPortalTool(
  tool: Tool,
  theme: Theme,
  config: WatermarkConfig,
  viewer: Viewer,
  opts: ToolOptions = {},
): string {
  const text = watermarkText(config, { recipient: viewer.recipient, timestamp: viewer.timestamp, label: config.label });
  return renderTool(tool, theme, {
    ...opts,
    presenter: false,
    watermark: { text, opacity: config.opacity },
    protect: true,
  });
}

/**
 * Serve a pack's hub through the portal: the grouped, card-based index of a client engagement,
 * with the per-viewer watermark and anti-copy friction. The tile links are supplied by the
 * caller (content.ts), which resolves, for this recipient, the share link of each artifact in
 * the pack, so a client navigates only their own gated artifacts. A slug with no resolved share
 * link is dropped, never linked to an ungated path.
 */
export function renderPortalHub(
  pack: Pack,
  theme: Theme,
  config: WatermarkConfig,
  viewer: Viewer,
  opts: HubOptions = {},
): string {
  const text = watermarkText(config, { recipient: viewer.recipient, timestamp: viewer.timestamp, label: config.label });
  return renderHub(pack, theme, {
    ...opts,
    watermark: { text, opacity: config.opacity },
    protect: true,
  });
}
