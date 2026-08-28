import { describe, expect, it } from "vitest";
import { isSyncHealthData } from "@/lib/sync-health";

describe("sync health response validation", () => {
  it("accepts a complete sync health response", () => {
    expect(
      isSyncHealthData({
        sources: [],
        recentRuns: [],
        health: {
          status: "healthy",
          sourceCount: 1,
          activeSources: 1,
          failedRunsLast10: 0,
          lastSyncAt: null,
        },
      }),
    ).toBe(true);
  });

  it("rejects API error responses instead of letting the page crash", () => {
    expect(isSyncHealthData({ error: "Unauthorized" })).toBe(false);
    expect(isSyncHealthData({ sources: [], recentRuns: [] })).toBe(false);
  });
});
