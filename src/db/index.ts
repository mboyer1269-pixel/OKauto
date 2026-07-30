import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

const globalDatabase = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
  database?: ReturnType<typeof drizzle<typeof schema>>;
};

export function sqlClient(): ReturnType<typeof postgres> {
  globalDatabase.sqlClient ??= postgres(env().DATABASE_URL, {
    max: env().NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return globalDatabase.sqlClient;
}

export function db(): ReturnType<typeof drizzle<typeof schema>> {
  globalDatabase.database ??= drizzle(sqlClient(), { schema });
  return globalDatabase.database;
}
