import { describe, expect, it } from "vitest";
import { shouldCreateDemoAccounts } from "@okauto/database";

describe("demo seed guard", () => {
  it("never seeds demo accounts in production unless explicitly allowed", () => {
    expect(shouldCreateDemoAccounts({ NODE_ENV: "production" })).toBe(false);
    expect(
      shouldCreateDemoAccounts({
        NODE_ENV: "production",
        ALLOW_DEMO_SEED: "true",
      }),
    ).toBe(true);
    expect(shouldCreateDemoAccounts({ NODE_ENV: "development" })).toBe(true);
  });
});
