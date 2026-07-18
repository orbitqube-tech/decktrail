import { desc, eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { events } from "./schema.js";
import { randomToken } from "../crypto.js";
import type { EventStore, EventInput, EventRecord } from "../analytics.js";

/** Default cap on how many events a workspace read returns. */
const DEFAULT_LIST_LIMIT = 5000;

/** Postgres-backed event store. Writes are append-only; the audit log is never mutated. */
export class DrizzleEventStore implements EventStore {
  constructor(private readonly db: Db) {}

  async record(e: EventInput): Promise<void> {
    await this.db.insert(events).values({
      id: `evt_${randomToken(12)}`,
      workspace: e.workspace,
      type: e.type,
      artifactId: e.artifactId ?? null,
      versionId: e.versionId ?? null,
      recipient: e.recipient ?? null,
      ip: e.ip ?? null,
      ua: e.ua ?? null,
      meta: e.meta ?? null,
    });
  }

  async list(workspace?: string, opts?: { limit?: number }): Promise<EventRecord[]> {
    const base = this.db.select().from(events);
    const scoped = workspace === undefined ? base : base.where(eq(events.workspace, workspace));
    const rows = await scoped.orderBy(desc(events.ts)).limit(opts?.limit ?? DEFAULT_LIST_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      workspace: r.workspace,
      type: r.type,
      artifactId: r.artifactId ?? undefined,
      versionId: r.versionId ?? undefined,
      recipient: r.recipient ?? undefined,
      ip: r.ip ?? undefined,
      ua: r.ua ?? undefined,
      meta: (r.meta as Record<string, unknown> | null) ?? undefined,
    }));
  }
}
