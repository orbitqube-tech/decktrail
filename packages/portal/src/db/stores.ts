import { and, eq, gt } from "drizzle-orm";
import type { Db } from "./client.js";
import { magicLinks, sessions, invites } from "./schema.js";
import type {
  MagicLinkStore,
  MagicLinkRecord,
  SessionStore,
  SessionRecord,
} from "../auth/stores.js";

/** Postgres-backed magic-link store. The claim is a single atomic delete-returning. */
export class DrizzleMagicLinkStore implements MagicLinkStore {
  constructor(private readonly db: Db) {}

  async save(rec: MagicLinkRecord): Promise<void> {
    await this.db.insert(magicLinks).values(rec);
  }

  async claim(tokenHash: string, now: number): Promise<MagicLinkRecord | null> {
    const rows = await this.db
      .delete(magicLinks)
      .where(and(eq(magicLinks.tokenHash, tokenHash), gt(magicLinks.expiresAt, now)))
      .returning();
    const r = rows[0];
    return r ? { tokenHash: r.tokenHash, email: r.email, workspace: r.workspace, expiresAt: r.expiresAt } : null;
  }
}

/** Postgres-backed session store, with server-side revocation. */
export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: Db) {}

  async create(rec: SessionRecord): Promise<void> {
    await this.db.insert(sessions).values(rec);
  }

  async get(sid: string): Promise<SessionRecord | null> {
    const r = (await this.db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1))[0];
    return r ? { sid: r.sid, email: r.email, workspace: r.workspace, expiresAt: r.expiresAt, revoked: r.revoked } : null;
  }

  async revoke(sid: string): Promise<void> {
    await this.db.update(sessions).set({ revoked: true }).where(eq(sessions.sid, sid));
  }

  async revokeByEmail(email: string, workspace: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revoked: true })
      .where(and(eq(sessions.email, email), eq(sessions.workspace, workspace)));
  }
}

/**
 * Find the invite for an email, and the workspace it belongs to.
 *
 * Looked up by email alone, deliberately. A recipient arrives holding a share link and knows
 * nothing about workspaces, so there is nothing they could tell us: requiring one meant an
 * invite created under a deck's own workspace could never be matched, and the recipient was
 * silently refused a magic link forever. Which deck they may then open is decided by the
 * share's recipient (see content.ts), not by this.
 */
export async function findInvite(db: Db, email: string): Promise<{ workspace: string } | null> {
  // Ordered, because one address can be invited to more than one client. Without it the
  // database may return either row, so the same person could get a session tagged to a
  // different client on each sign-in and their opens would scatter across dashboards.
  // Oldest wins: their first engagement is the stable answer.
  const r = (await db.select().from(invites).where(eq(invites.email, email)).orderBy(invites.id).limit(1))[0];
  return r ? { workspace: r.workspace } : null;
}
