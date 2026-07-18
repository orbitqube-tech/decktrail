import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.js";

/** Run pending migrations from the generated SQL in `migrationsFolder`. */
export async function runMigrations(db: Db, migrationsFolder: string): Promise<void> {
  await migrate(db, { migrationsFolder });
}
