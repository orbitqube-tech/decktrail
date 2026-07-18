import type { Deck, DocumentArtifact, Tool, Theme, WatermarkConfig } from "@decktrail/ir";
import { renderStandalone, type StandaloneOptions } from "./index.js";
import { renderDocument, type DocumentOptions } from "./document.js";
import { renderTool, type ToolOptions } from "./tool.js";
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
