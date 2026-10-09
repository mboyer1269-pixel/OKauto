import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MemoryRateLimitStore,
  VIN_DECODE_RATE_LIMIT,
  checkVinDecodeRateLimit,
  setAuthRateLimitStoreForTests,
} from "@/lib/rate-limit";

describe("VIN decode rate limiter", () => {
  beforeEach(() => {
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  afterEach(() => {
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  it("returns 429 after the per-user decode-vin budget", async () => {
    const orgId = "org-1";
    const userId = "user-1";
    for (let i = 0; i < VIN_DECODE_RATE_LIMIT.maxPerUser; i += 1) {
      const allowed = await checkVinDecodeRateLimit({ orgId, userId });
      expect(allowed.allowed).toBe(true);
    }
    const limited = await checkVinDecodeRateLimit({ orgId, userId });
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    const otherUser = await checkVinDecodeRateLimit({
      orgId,
      userId: "user-2",
    });
    expect(otherUser.allowed).toBe(true);
  });
});
