import { NextResponse } from "next/server";
import { db } from "@okauto/db";
import { getRedis } from "@/lib/queue";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {
    api: "ok",
    database: "error",
    redis: "error",
  };

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    const redis = getRedis();
    const pong = await redis.ping();
    checks.redis = pong === "PONG" ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      service: "okauto",
      version: "0.1.0",
      checks,
      policy: {
        humanInTheLoop: true,
        neverBypassCaptcha: true,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
