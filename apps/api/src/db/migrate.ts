import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the committed SQL migrations, resolved from both src/ and dist/. */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const config = loadConfig();
  runMigrations(config.DATABASE_URL)
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
