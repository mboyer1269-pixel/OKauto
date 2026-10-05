/** Redis key written by the worker every 30s. Keep in sync with apps/worker/src/heartbeat.ts */
export const WORKER_HEARTBEAT_REDIS_KEY = "suivia:worker:heartbeat";

export const WORKER_HEARTBEAT_STALE_MS = 2 * 60 * 1000;

export function deployedVersion(): string {
  return process.env.GIT_SHA || process.env.GITHUB_SHA || "dev";
}
