import { NextResponse } from "next/server";
import { prisma } from "@okauto/database";
import IORedis from "ioredis";
import {
  WORKER_HEARTBEAT_REDIS_KEY,
  WORKER_HEARTBEAT_STALE_MS,
  deployedVersion,
} from "@/lib/worker-heartbeat";

export const dynamic = "force-dynamic";

async function databaseUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function redisAndWorker(): Promise<{
  redis: boolean;
  worker: "ok" | "stale" | "missing";
  workerAgeMs: number | null;
}> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { redis: false, worker: "missing", workerAgeMs: null };
  }

  const redis = new IORedis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    await redis.ping();
    const raw = await redis.get(WORKER_HEARTBEAT_REDIS_KEY);
    if (!raw) {
      return { redis: true, worker: "stale", workerAgeMs: null };
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) {
      return { redis: true, worker: "stale", workerAgeMs: null };
    }
    const workerAgeMs = Date.now() - ts;
    if (workerAgeMs > WORKER_HEARTBEAT_STALE_MS) {
      return { redis: true, worker: "stale", workerAgeMs };
    }
    return { redis: true, worker: "ok", workerAgeMs };
  } catch {
    return { redis: false, worker: "missing", workerAgeMs: null };
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const version = deployedVersion();
  const db = await databaseUp();
  const { redis, worker, workerAgeMs } = await redisAndWorker();
  const ready = db && redis && worker === "ok";

  return NextResponse.json(
    {
      status: ready ? "ok" : "not_ready",
      version,
      db,
      redis,
      worker,
      workerAgeMs,
    },
    { status: ready ? 200 : 503 },
  );
}
