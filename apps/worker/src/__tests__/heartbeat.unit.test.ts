import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("writeWorkerHeartbeat", () => {
  afterEach(() => {
    delete process.env.WORKER_HEARTBEAT_PATH;
    vi.resetModules();
  });

  it("writes a timestamp file and Redis key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "okauto-hb-"));
    const file = path.join(dir, "worker-heartbeat");
    process.env.WORKER_HEARTBEAT_PATH = file;

    const { writeWorkerHeartbeat, WORKER_HEARTBEAT_REDIS_KEY } = await import(
      "../heartbeat.js"
    );

    const set = vi.fn().mockResolvedValue("OK");
    await writeWorkerHeartbeat({ set } as never);

    const contents = await readFile(file, "utf8");
    expect(Number(contents)).toBeGreaterThan(0);
    expect(set).toHaveBeenCalledWith(WORKER_HEARTBEAT_REDIS_KEY, contents);
  });
});
