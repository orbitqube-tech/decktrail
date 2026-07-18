import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { settings } from "./schema.js";
import type { SettingsStore } from "../settings.js";

/** Postgres-backed settings store with upsert. */
export class DrizzleSettingsStore implements SettingsStore {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const row = (await this.db.select().from(settings).where(eq(settings.key, key)).limit(1))[0];
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
}
