import { describe, expect, it } from "vitest";

import { createHandoffToken, verifyHandoffToken } from "@/lib/handoff";

process.env.SESSION_PEPPER ??= "test-session-pepper-value-with-32-characters";
process.env.IP_HASH_KEY ??= "test-ip-hash-key-value-with-32-characters";
process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:5432/unused";

describe("extension handoff tokens", () => {
  const input = {
    listingId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
  };

  it("round-trips scoped claims without exposing the session", () => {
    const claims = verifyHandoffToken(createHandoffToken(input));
    expect(claims).toMatchObject(input);
    expect(claims.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects tampering", () => {
    const token = createHandoffToken(input);
    expect(() => verifyHandoffToken(`${token.slice(0, -1)}x`)).toThrow("invalid");
  });
});
