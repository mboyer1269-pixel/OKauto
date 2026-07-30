import { describe, expect, it } from "vitest";
import { rateLimit } from "@/server/ratelimit";
import {
  createSessionToken,
  sessionFromRequest,
  verifySessionToken,
  SESSION_COOKIE,
} from "@/server/session";

describe("session tokens", () => {
  it("round-trips a signed session", async () => {
    const token = await createSessionToken({ userId: "u1", email: "a@b.co" });
    const payload = await verifySessionToken(token);
    expect(payload).toEqual({ userId: "u1", email: "a@b.co" });
  });

  it("rejects tampered tokens", async () => {
    const token = await createSessionToken({ userId: "u1", email: "a@b.co" });
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySessionToken("garbage")).toBeNull();
  });

  it("parses the session cookie from a Request", async () => {
    const token = await createSessionToken({ userId: "u2", email: "c@d.co" });
    const req = new Request("http://x/", {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${token}; more=2` },
    });
    const payload = await sessionFromRequest(req);
    expect(payload?.userId).toBe("u2");
    expect(await sessionFromRequest(new Request("http://x/"))).toBeNull();
  });
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `k-${Date.now()}`;
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("isolates keys", () => {
    const a = `a-${Date.now()}`;
    const b = `b-${Date.now()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });
});
