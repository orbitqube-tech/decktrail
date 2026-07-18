import { and, eq, desc } from "drizzle-orm";
import type { Db } from "./client.js";
import { artifacts, deckVersions, shares, invites } from "./schema.js";
import { randomToken } from "../crypto.js";
import type { Publisher, PublishInput } from "../app.js";

/** Postgres-backed publishing: upsert artifact, append immutable version, mint share. */
export class DrizzlePublisher implements Publisher {
  constructor(private readonly db: Db) {}

  async publish(input: PublishInput): Promise<{ artifactId: string; versionId: string; version: number }> {
    let art = (await this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.workspace, input.workspace), eq(artifacts.slug, input.slug)))
      .limit(1))[0];
    if (!art) {
      const id = `art_${randomToken(9)}`;
      await this.db.insert(artifacts).values({ id, workspace: input.workspace, slug: input.slug, kind: input.kind, title: input.title });
      art = { id, workspace: input.workspace, slug: input.slug, kind: input.kind, title: input.title, themeId: null };
    }

    const latest = (await this.db
      .select()
      .from(deckVersions)
      .where(eq(deckVersions.artifactId, art.id))
      .orderBy(desc(deckVersions.version))
      .limit(1))[0];
    const version = (latest?.version ?? 0) + 1;
    const versionId = `ver_${randomToken(9)}`;
    await this.db.insert(deckVersions).values({
      id: versionId,
      artifactId: art.id,
      version,
      parentVersion: latest?.version ?? null,
      ir: input.ir,
      theme: input.theme ?? null,
      author: input.author,
      source: "generated",
    });
    return { artifactId: art.id, versionId, version };
  }

  async createShare(input: {
    workspace: string;
    slug: string;
    recipient: string;
    version?: number;
  }): Promise<{ shareId: string } | null> {
    const art = (await this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.workspace, input.workspace), eq(artifacts.slug, input.slug)))
      .limit(1))[0];
    if (!art) return null;

    const ver =
      input.version === undefined
        ? (await this.db.select().from(deckVersions).where(eq(deckVersions.artifactId, art.id)).orderBy(desc(deckVersions.version)).limit(1))[0]
        : (await this.db.select().from(deckVersions).where(and(eq(deckVersions.artifactId, art.id), eq(deckVersions.version, input.version))).limit(1))[0];
    if (!ver) return null;

    const shareId = `shr_${randomToken(12)}`;
    await this.db.insert(shares).values({ shareId, artifactId: art.id, versionId: ver.id, recipient: input.recipient });

    // Invite the recipient so they can sign in. Idempotent on (email, workspace).
    const invited = (await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.email, input.recipient), eq(invites.workspace, input.workspace)))
      .limit(1))[0];
    if (!invited) {
      await this.db.insert(invites).values({ id: `inv_${randomToken(9)}`, workspace: input.workspace, email: input.recipient });
    }

    return { shareId };
  }
}
