import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { startWorkerLoop } from "./jobs/workers.js";
import { createAiService } from "./services/ai.js";
import { createVinDecoder } from "./services/vinDecoder.js";

async function main() {
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
  const { db, close } = createDb(config.DATABASE_URL);
  const ai = createAiService(config, fetch, console);
  const decodeVin = createVinDecoder({ enableNhtsa: config.ENABLE_NHTSA_DECODER });

  const app = await buildApp({ config, db, ai, decodeVin, fetchImpl: fetch });

  const worker = config.WORKER_INLINE
    ? startWorkerLoop({ db, ai, logger: app.log }, { pollIntervalMs: config.WORKER_POLL_INTERVAL_MS })
    : null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      if (worker) await worker.stop();
      await close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(
    { port: config.PORT, workerInline: config.WORKER_INLINE, aiEnabled: ai.enabled },
    "OpenLot API started",
  );
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
