import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export { schema };

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/**
 * Canonical database handle used across the app. Tests satisfy the same
 * interface with a PGlite-backed drizzle instance (see test/helpers.ts).
 */
export type Db = ReturnType<typeof createDb>["db"];
