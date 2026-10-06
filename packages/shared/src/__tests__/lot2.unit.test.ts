import { describe, expect, it, vi } from "vitest";
import {
  classifySyncHealth,
  isStaleSyncSource,
  isSyncDegradedAlertsEnabled,
} from "../sync-degraded";
import {
  isLastAttempt,
  syncFetchLimits,
  syncJobId,
  syncJobOptions,
} from "../job-policy";
import {
  redactPiiText,
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
  stripQuery,
} from "../sentry-scrub";
import { pingUptime, workerHeartbeatUrl } from "../uptime-ping";

describe("classifySyncHealth", () => {
  const now = Date.parse("2026-10-05T20:00:00Z");

  it("is healthy when sources recently succeeded", () => {
    const health = classifySyncHealth({
      sources: [
        {
          id: "s1",
          isActive: true,
          intervalMinutes: 60,
          lastSyncAt: "2026-10-05T19:30:00Z",
          lastSyncStatus: "success",
        },
      ],
      failedRunsLast10: 0,
      nowMs: now,
    });
    expect(health.status).toBe("healthy");
    expect(health.reasons).toEqual([]);
  });

  it("is degraded when lastSync is older than 2× interval", () => {
    const source = {
      id: "s1",
      isActive: true,
      intervalMinutes: 60,
      lastSyncAt: "2026-10-05T17:00:00Z",
      lastSyncStatus: "success",
    };
    expect(isStaleSyncSource(source, now)).toBe(true);
    const health = classifySyncHealth({
      sources: [source],
      failedRunsLast10: 0,
      nowMs: now,
    });
    expect(health.status).toBe("degraded");
    expect(health.staleSourceIds).toEqual(["s1"]);
  });

  it("ignores inactive sources for staleness", () => {
    expect(
      isStaleSyncSource(
        {
          isActive: false,
          intervalMinutes: 15,
          lastSyncAt: "2026-01-01T00:00:00Z",
          lastSyncStatus: "success",
        },
        now,
      ),
    ).toBe(false);
  });

  it("treats never-synced sources as stale after 2× interval from createdAt", () => {
    expect(
      isStaleSyncSource(
        {
          id: "new",
          isActive: true,
          intervalMinutes: 60,
          lastSyncAt: null,
          lastSyncStatus: null,
          createdAt: "2026-10-05T17:00:00Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isStaleSyncSource(
        {
          id: "fresh",
          isActive: true,
          intervalMinutes: 60,
          lastSyncAt: null,
          lastSyncStatus: null,
          createdAt: "2026-10-05T19:30:00Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("ignores inactive sources when counting source errors", () => {
    const health = classifySyncHealth({
      sources: [
        {
          id: "off",
          isActive: false,
          intervalMinutes: 60,
          lastSyncAt: "2026-10-05T19:50:00Z",
          lastSyncStatus: "error",
        },
      ],
      failedRunsLast10: 0,
      nowMs: now,
    });
    expect(health.status).toBe("healthy");
    expect(health.sourceErrors).toBe(0);
  });

  it("is degraded on failed runs or source errors", () => {
    expect(
      classifySyncHealth({
        sources: [
          {
            isActive: true,
            intervalMinutes: 60,
            lastSyncAt: "2026-10-05T19:50:00Z",
            lastSyncStatus: "error",
          },
        ],
        failedRunsLast10: 0,
        nowMs: now,
      }).status,
    ).toBe("degraded");
    expect(
      classifySyncHealth({
        sources: [
          {
            isActive: true,
            intervalMinutes: 60,
            lastSyncAt: "2026-10-05T19:50:00Z",
            lastSyncStatus: "success",
          },
        ],
        failedRunsLast10: 2,
        nowMs: now,
      }).status,
    ).toBe("degraded");
  });

  it("uses review when only pending feed review remains", () => {
    const health = classifySyncHealth({
      sources: [
        {
          isActive: true,
          intervalMinutes: 60,
          lastSyncAt: "2026-10-05T19:50:00Z",
          lastSyncStatus: "success",
        },
      ],
      failedRunsLast10: 0,
      pendingFeedReview: 3,
      nowMs: now,
    });
    expect(health.status).toBe("review");
  });
});

describe("job policy", () => {
  it("dedups in-flight sync jobs without a sticky jobId", () => {
    expect(syncJobId("abc")).toBe("sync-abc");
    const opts = syncJobOptions("abc");
    expect(opts).toMatchObject({
      deduplication: { id: "sync-abc" },
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
    expect(opts).not.toHaveProperty("jobId");
  });

  it("keeps the DÉGRADÉE alert off until SYNC_DEGRADED_ALERTS=1", () => {
    expect(isSyncDegradedAlertsEnabled({})).toBe(false);
    expect(isSyncDegradedAlertsEnabled({ SYNC_DEGRADED_ALERTS: "1" })).toBe(
      true,
    );
  });

  it("notifies only on the last attempt", () => {
    expect(isLastAttempt(0, 3)).toBe(false);
    expect(isLastAttempt(1, 3)).toBe(false);
    expect(isLastAttempt(2, 3)).toBe(true);
    expect(isLastAttempt(0, 1)).toBe(true);
  });

  it("reads fetch limits from env with defaults", () => {
    expect(syncFetchLimits({})).toEqual({
      timeoutMs: 30_000,
      maxBytes: 8 * 1024 * 1024,
    });
    expect(
      syncFetchLimits({
        SYNC_FETCH_TIMEOUT_MS: "15000",
        SYNC_FETCH_MAX_BYTES: "1024",
      }),
    ).toEqual({ timeoutMs: 15_000, maxBytes: 1024 });
  });
});

describe("sentry scrub", () => {
  it("strips PII from the event", () => {
    const event = sentryBeforeSend({
      message: "failed for a@b.com",
      user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4" },
      request: {
        url: "https://suivia.ca/api?token=abc",
        cookies: "sid=1",
        data: { password: "x" },
        query_string: "token=abc",
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json",
        },
      },
      extra: { jwt: "nope", ok: "keep" },
      contexts: { trace: { email: "a@b.com", status: "ok" } },
      tags: { token: "secret", route: "/vehicles" },
      exception: {
        values: [{ value: "Unique constraint failed on email a@b.com" }],
      },
    });
    expect(event?.message).toBe("failed for [Filtered]");
    expect(event?.user).toEqual({ id: "u1" });
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.query_string).toBeUndefined();
    expect(event?.request?.url).toBe("https://suivia.ca/api");
    expect(event?.request?.headers?.authorization).toBe("[Filtered]");
    expect(event?.request?.headers?.["content-type"]).toBe("application/json");
    expect(event?.extra).toEqual({ jwt: "[Filtered]", ok: "keep" });
    expect(event?.contexts).toEqual({
      trace: { email: "[Filtered]", status: "ok" },
    });
    expect(event?.tags).toEqual({ token: "[Filtered]", route: "/vehicles" });
    expect(event?.exception?.values?.[0]?.value).toBe(
      "Unique constraint failed on email [Filtered]",
    );
    expect(stripQuery("https://x.test/y")).toBe("https://x.test/y");
    expect(redactPiiText("call +1 514-555-1212")).toContain("[Filtered]");
    expect(
      sentryBeforeBreadcrumb({
        message: "login a@b.com",
        data: {
          authorization: "Bearer x",
          path: "/ok",
          url: "https://suivia.ca/api?token=abc",
        },
      }),
    ).toEqual({
      message: "login [Filtered]",
      data: {
        authorization: "[Filtered]",
        path: "/ok",
        url: "https://suivia.ca/api",
      },
    });
  });
});

describe("uptime ping", () => {
  it("is a no-op when the URL is unset", async () => {
    const fetchImpl = vi.fn();
    await expect(pingUptime("", fetchImpl as never)).resolves.toBe("skipped");
    await expect(pingUptime(undefined, fetchImpl as never)).resolves.toBe(
      "skipped",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("GETs the heartbeat URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await expect(
      pingUptime("https://uptime.example/hb", fetchImpl as never),
    ).resolves.toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("prefers WORKER_HEARTBEAT_URL", () => {
    expect(
      workerHeartbeatUrl({
        WORKER_HEARTBEAT_URL: " https://a ",
        UPTIME_HEARTBEAT_URL: "https://b",
      }),
    ).toBe("https://a");
    expect(workerHeartbeatUrl({})).toBe("");
  });
});
