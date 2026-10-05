import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET as healthHandler } from "@/app/api/health/route";
import { GET as readyHandler } from "@/app/api/health/ready/route";
import IORedis from "ioredis";
import { WORKER_HEARTBEAT_REDIS_KEY } from "@/lib/worker-heartbeat";

describe("health endpoints", () => {
  const previousSha = process.env.GIT_SHA;
  let redis: IORedis | undefined;

  beforeAll(() => {
    process.env.GIT_SHA = "abc123def456abc123def456abc123def456abc1";
    if (process.env.REDIS_URL) {
      redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    }
  });

  afterAll(async () => {
    if (previousSha === undefined) {
      delete process.env.GIT_SHA;
    } else {
      process.env.GIT_SHA = previousSha;
    }
    if (redis) {
      await redis.del(WORKER_HEARTBEAT_REDIS_KEY);
      redis.disconnect();
    }
  });

  it("liveness returns the deployed SHA and db=true", async () => {
    const res = await healthHandler();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.version).toBe("abc123def456abc123def456abc123def456abc1");
    expect(data.db).toBe(true);
  });

  it("readiness is 503 with worker stale when the heartbeat is missing", async () => {
    if (redis) {
      await redis.del(WORKER_HEARTBEAT_REDIS_KEY);
    }
    const res = await readyHandler();
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.db).toBe(true);
    expect(["stale", "missing"]).toContain(data.worker);
    expect(data.status).toBe("not_ready");
  });

  it("readiness is 200 when the worker heartbeat is fresh", async () => {
    if (!redis) {
      return;
    }
    await redis.set(WORKER_HEARTBEAT_REDIS_KEY, String(Date.now()));
    const res = await readyHandler();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.db).toBe(true);
    expect(data.redis).toBe(true);
    expect(data.worker).toBe("ok");
    expect(data.version).toBe("abc123def456abc123def456abc123def456abc1");
  });
});
