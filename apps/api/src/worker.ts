import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { startWorkerLoop } from "./jobs/workers.js";
import { createAiService } from "./services/ai.js";

/** Dedicated worker process entrypoint (scale-out deploys). */
async function main() {
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
  const { db, close } = createDb(config.DATABASE_URL);
  const ai = createAiService(config, fetch, console);

  console.log("OpenLot worker started");
  const worker = startWorkerLoop(
    { db, ai, logger: { info: (o, m) => console.log(m ?? "", o), error: (o, m) => console.error(m ?? "", o) } },
    { pollIntervalMs: config.WORKER_POLL_INTERVAL_MS },
  );

  const shutdown = async () => {
    await worker.stop();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});
