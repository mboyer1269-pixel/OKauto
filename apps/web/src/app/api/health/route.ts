import { prisma } from "@lotpilot/db";
import { json } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  let healthy = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unreachable";
    healthy = false;
  }
  try {
    const beats = await prisma.workerHeartbeat.findMany();
    const stale = beats.filter((b) => Date.now() - b.lastBeatAt.getTime() > 5 * 60_000);
    checks.worker = beats.length === 0 ? "not_started" : stale.length > 0 ? "stale" : "ok";
  } catch {
    checks.worker = "unknown";
  }
  return json(
    { status: healthy ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
