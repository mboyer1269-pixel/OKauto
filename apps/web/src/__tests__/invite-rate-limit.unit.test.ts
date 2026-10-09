import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryRateLimitStore,
  enforceAcceptInviteRateLimit,
  enforceMemberInviteRateLimit,
  setAuthRateLimitStoreForTests,
} from "@/lib/rate-limit";
import { safeInvitationNext } from "@/lib/member-provisioning";

const here = dirname(fileURLToPath(import.meta.url));

describe("invitation rate limits", () => {
  beforeEach(() => {
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  afterEach(() => {
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  it("refuses member invitations when the store errors (fail-closed)", async () => {
    setAuthRateLimitStoreForTests({
      increment: async () => {
        throw new Error("redis down");
      },
      get: async () => {
        throw new Error("redis down");
      },
      reset: async () => {
        throw new Error("redis down");
      },
    });

    const limited = await enforceMemberInviteRateLimit("org-fail-closed");
    expect(limited?.status).toBe(429);
  });

  it("refuses accept attempts when the store errors (fail-closed)", async () => {
    setAuthRateLimitStoreForTests({
      increment: async () => {
        throw new Error("redis down");
      },
      get: async () => {
        throw new Error("redis down");
      },
      reset: async () => {
        throw new Error("redis down");
      },
    });

    const limited = await enforceAcceptInviteRateLimit(
      new Request("http://localhost/api/v1/invitations/token/accept", {
        method: "POST",
      }),
      "token-hash",
    );
    expect(limited?.status).toBe(429);
  });
});

describe("invitation next and audit", () => {
  it("only allows the invitation path as a login next target", () => {
    expect(
      safeInvitationNext(
        "/invitation/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(
      "/invitation/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(safeInvitationNext("/dashboard")).toBeNull();
    expect(safeInvitationNext("https://evil.example/invitation/aa")).toBeNull();
    expect(safeInvitationNext("/invitation/../admin")).toBeNull();
  });

  it("lists accounts provisioned by an organization they no longer belong to", () => {
    const sql = readFileSync(
      join(here, "../../../../deploy/audit-memberships.sql"),
      "utf8",
    );
    expect(sql).toMatch(/provisionedByOrganizationId/);
    expect(sql).toMatch(/ne sont plus membres/);
    expect(sql).toMatch(/NOT EXISTS/);
  });
});
