/**
 * Storage interfaces for the auth core, so the magic-link and session logic can be
 * unit-tested with the in-memory implementations below and backed by Postgres in
 * production. Dependency inversion: the logic never imports the database.
 */

export interface MagicLinkRecord {
  tokenHash: string;
  email: string;
  workspace: string;
  expiresAt: number;
}

export interface MagicLinkStore {
  save(rec: MagicLinkRecord): Promise<void>;
  /**
   * Atomically claim: if a valid, unexpired record matches the hash, consume it (so it
   * can never be used twice) and return it; otherwise return null. In Postgres this is a
   * single `DELETE ... WHERE token_hash = $1 AND expires_at > $2 RETURNING *`.
   */
  claim(tokenHash: string, now: number): Promise<MagicLinkRecord | null>;
}

export interface SessionRecord {
  sid: string;
  email: string;
  workspace: string;
  expiresAt: number;
  revoked: boolean;
}

export interface SessionStore {
  create(rec: SessionRecord): Promise<void>;
  get(sid: string): Promise<SessionRecord | null>;
  revoke(sid: string): Promise<void>;
  /** Revoking an invite must kill live sessions (a gap the prior art could not close). */
  revokeByEmail(email: string, workspace: string): Promise<void>;
}

export class InMemoryMagicLinkStore implements MagicLinkStore {
  private readonly m = new Map<string, MagicLinkRecord>();

  async save(rec: MagicLinkRecord): Promise<void> {
    this.m.set(rec.tokenHash, rec);
  }

  async claim(tokenHash: string, now: number): Promise<MagicLinkRecord | null> {
    const rec = this.m.get(tokenHash);
    if (!rec || rec.expiresAt < now) return null;
    this.m.delete(tokenHash); // single use
    return rec;
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly m = new Map<string, SessionRecord>();

  async create(rec: SessionRecord): Promise<void> {
    this.m.set(rec.sid, rec);
  }

  async get(sid: string): Promise<SessionRecord | null> {
    return this.m.get(sid) ?? null;
  }

  async revoke(sid: string): Promise<void> {
    const rec = this.m.get(sid);
    if (rec) rec.revoked = true;
  }

  async revokeByEmail(email: string, workspace: string): Promise<void> {
    for (const rec of this.m.values()) {
      if (rec.email === email && rec.workspace === workspace) rec.revoked = true;
    }
  }
}
