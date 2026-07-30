import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

import { env } from "../src/lib/env";

const client = postgres(env().DATABASE_URL, { max: 1, prepare: false });
const directory = resolve(process.cwd(), "migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const [state] = await client<{ exists: boolean }[]>`select to_regclass('public.schema_migrations') is not null as exists`;
const applied = state?.exists
  ? new Set((await client<{ filename: string }[]>`select filename from schema_migrations`).map((row) => row.filename))
  : new Set<string>();
const pending = files.filter((file) => !applied.has(file));

if (process.argv.includes("--check")) {
  if (pending.length) {
    console.error(`Pending migrations: ${pending.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.info("Database schema is current.");
  }
  await client.end();
} else {
  for (const filename of pending) {
    const migration = await readFile(resolve(directory, filename), "utf8");
    await client.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`insert into schema_migrations (filename) values (${filename})`;
    });
    console.info(`Applied ${filename}`);
  }
  if (!pending.length) console.info("No pending migrations.");
  await client.end();
}
