import { writeFile } from "node:fs/promises";
import type { Redis } from "ioredis";

/** Keep in sync with apps/web/src/lib/worker-heartbeat.ts */
export const WORKER_HEARTBEAT_REDIS_KEY = "suivia:worker:heartbeat";

export const WORKER_HEARTBEAT_PATH =
  process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/worker-heartbeat";

export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

export async function writeWorkerHeartbeat(redis: Redis): Promise<void> {
  const now = String(Date.now());
  await writeFile(WORKER_HEARTBEAT_PATH, now, "utf8");
  await redis.set(WORKER_HEARTBEAT_REDIS_KEY, now);
}

export function startWorkerHeartbeat(
  redis: Redis,
  onBeat?: () => Promise<unknown> | unknown,
): NodeJS.Timeout {
  const beat = () => {
    writeWorkerHeartbeat(redis)
      .then(() => onBeat?.())
      .catch((err: unknown) => {
        console.error("worker heartbeat failed", err);
      });
  };
  beat();
  return setInterval(beat, WORKER_HEARTBEAT_INTERVAL_MS);
}
