import { readEnv, type EnvMap } from "./job-policy";

export type UptimePingResult = "skipped" | "ok" | "error";

function firstUrl(...candidates: Array<string | undefined | null>): string {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export async function pingUptime(
  url?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<UptimePingResult> {
  const target = firstUrl(url);
  if (!target) return "skipped";

  try {
    const response = await fetchImpl(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`uptime ping HTTP ${response.status}`);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("uptime ping failed", err);
    return "error";
  }
}

export function workerHeartbeatUrl(env?: EnvMap): string {
  const values = readEnv(env);
  return firstUrl(
    values.WORKER_HEARTBEAT_URL,
    values.UPTIME_HEARTBEAT_URL,
    values.BETTERSTACK_HEARTBEAT_URL,
  );
}
