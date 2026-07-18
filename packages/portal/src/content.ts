import { and, eq, isNull } from "drizzle-orm";
import { Deck, DocumentArtifact, Tool, Pack, Theme } from "@decktrail/ir";
import { renderPortalDeck, renderPortalDocument, renderPortalTool, renderPortalHub, fontFaceCss } from "@decktrail/renderers";
import type { Db } from "./db/client.js";
import { shares, deckVersions, artifacts, themes } from "./db/schema.js";
import type { Viewer } from "./app.js";
import { defaultTheme, defaultWatermark } from "./defaults.js";
import { EVENT_INGEST_PATH } from "./analytics.js";

/** Rendered content plus the artifact and version the viewer saw, for the deck_open event. */
export interface ResolvedContent {
  html: string;
  artifactId: string;
  versionId: string;
}

/**
 * The share this id points at, if it is live and it belongs to this viewer. Otherwise null.
 *
 * The one gate for a share, shared by everything that acts on one. A share belongs to a single
 * person: signing in proves who you are, it does not entitle you to someone else's deck.
 * Without this the link was bearer-authorisation for anyone holding a session, so a forwarded
 * URL worked for any invited address on the portal, which is the one thing the product
 * promises it does not do (D5, D14).
 *
 * Null, never a 403: an existing share and a missing one must be indistinguishable, or the
 * answer tells a stranger that a given share id is real and that this portal serves that
 * person.
 */
export function makeResolveShare(db: Db) {
  return async (shareId: string, viewer: Viewer) => {
    const share = (await db
      .select()
      .from(shares)
      .where(and(eq(shares.shareId, shareId), isNull(shares.revokedAt)))
      .limit(1))[0];
    if (!share) return null;
    if (share.recipient.trim().toLowerCase() !== viewer.email.trim().toLowerCase()) return null;
    return share;
  };
}

/**
 * Resolve a share id to rendered HTML for a viewer: check the share is theirs, load its
 * pinned version (D13), validate the stored IR snapshot, and render it through the portal
 * renderer with the per-viewer watermark. Returns the HTML with the artifact and version
 * identifiers (so the serve route can record what was seen), or null if anything fails to
 * resolve, so the caller answers with a plain 404.
 */
export function makeResolveContent(db: Db) {
  const resolveShare = makeResolveShare(db);
  return async (shareId: string, viewer: Viewer): Promise<ResolvedContent | null> => {
    const share = await resolveShare(shareId, viewer);
    if (!share) return null;

    const ver = (await db.select().from(deckVersions).where(eq(deckVersions.id, share.versionId)).limit(1))[0];
    if (!ver) return null;

    const viewerCtx = { recipient: viewer.email, timestamp: new Date().toISOString() };

    // Theme resolution: a theme assigned to the artifact from the console (D16) wins, so the
    // owner can rebrand without republishing; otherwise the theme pinned on the version; then
    // the built-in neutral.
    const art = (await db.select().from(artifacts).where(eq(artifacts.id, share.artifactId)).limit(1))[0];
    let assigned: unknown;
    if (art?.themeId) {
      assigned = (await db.select().from(themes).where(eq(themes.id, art.themeId)).limit(1))[0]?.theme;
    }
    const parsedTheme = Theme.safeParse(assigned ?? ver.theme);
    const theme = parsedTheme.success ? parsedTheme.data : defaultTheme;

    // The engagement beacon, injected only here (the served variant) and never into a
    // standalone file. It reports only the share it was served from; the portal derives the
    // artifact and version. See beacon.ts for why it must not be trusted to name them.
    const beacon = { endpoint: EVENT_INGEST_PATH, shareId };
    // The artifact's own theme names a font family, and the family is embedded from the copy
    // fetched at deploy (`pnpm fetch-fonts`), per theme rather than once, because each artifact
    // may carry its own. A served deck therefore fetches nothing from anyone: a client opening a
    // confidential document should not announce it to a font CDN. Not fetched means the system
    // face, which is how every deck rendered until now.
    const opts = { beacon, fontCss: fontFaceCss(theme.typography.family) };

    let html: string | null = null;
    const deck = Deck.safeParse(ver.ir);
    if (deck.success) html = renderPortalDeck(deck.data, theme, defaultWatermark, viewerCtx, opts);
    const doc = html === null ? DocumentArtifact.safeParse(ver.ir) : null;
    if (doc?.success) html = renderPortalDocument(doc.data, theme, defaultWatermark, viewerCtx, opts);
    const tool = html === null ? Tool.safeParse(ver.ir) : null;
    if (tool?.success) html = renderPortalTool(tool.data, theme, defaultWatermark, viewerCtx, opts);

    // A pack renders as the hub: the grouped index of this engagement. Its tiles point only at
    // THIS recipient's own share for each artifact, resolved here. An artifact this recipient
    // was not shared is dropped from the index entirely, so the hub never exposes a slug or an
    // ungated path: the same recipient gate that protects a single artifact protects the index.
    const pack = html === null ? Pack.safeParse(ver.ir) : null;
    if (pack?.success) {
      const links: Record<string, string> = {};
      for (const ref of pack.data.artifacts) {
        const refArt = (await db
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.workspace, pack.data.workspace), eq(artifacts.slug, ref.slug)))
          .limit(1))[0];
        if (!refArt) continue;
        const refShare = (await db
          .select()
          .from(shares)
          .where(and(eq(shares.artifactId, refArt.id), eq(shares.recipient, share.recipient), isNull(shares.revokedAt)))
          .limit(1))[0];
        if (!refShare) continue;
        links[ref.slug] = `/d/${refShare.shareId}`;
      }
      const shown = { ...pack.data, artifacts: pack.data.artifacts.filter((r) => links[r.slug]) };
      html = renderPortalHub(shown, theme, defaultWatermark, viewerCtx, {
        ...opts,
        linkFor: (slug: string) => links[slug] ?? "#",
      });
    }

    if (html === null) return null;
    return { html, artifactId: share.artifactId, versionId: share.versionId };
  };
}
