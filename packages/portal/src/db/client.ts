import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/** Create a Postgres connection pool and a Drizzle client over it. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  return { pool, db };
}

export type Db = ReturnType<typeof createDb>["db"];
