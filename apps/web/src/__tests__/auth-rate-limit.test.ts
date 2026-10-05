import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as loginHandler } from "@/app/api/v1/auth/login/route";
import { POST as registerHandler } from "@/app/api/v1/auth/register/route";
import {
  AUTH_RATE_LIMIT,
  MemoryRateLimitStore,
  checkAuthRateLimit,
  recordAuthFailure,
  setAuthRateLimitStoreForTests,
} from "@/lib/rate-limit";

function makeLoginRequest(
  email: string,
  password: string,
  ip = "203.0.113.50",
) {
  return new Request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth rate limiter", () => {
  const previousTrustProxy = process.env.TRUST_PROXY;

  beforeEach(() => {
    process.env.TRUST_PROXY = "true";
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  afterEach(() => {
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
    setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
  });

  it("blocks an account after 5 failures in the window", async () => {
    const email = "locked@example.com";
    const request = makeLoginRequest(email, "wrong");

    for (let i = 0; i < AUTH_RATE_LIMIT.maxFailuresPerAccount; i += 1) {
      await recordAuthFailure(request, "login", email);
    }

    const limited = await checkAuthRateLimit({
      ip: "203.0.113.50",
      email,
      action: "login",
    });
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("blocks an IP after 20 failures in the window", async () => {
    const ip = "198.51.100.20";
    const request = makeLoginRequest("anyone@example.com", "wrong", ip);

    for (let i = 0; i < AUTH_RATE_LIMIT.maxFailuresPerIp; i += 1) {
      await recordAuthFailure(request, "login", `user-${i}@example.com`);
    }

    const limited = await checkAuthRateLimit({
      ip,
      email: "fresh@example.com",
      action: "login",
    });
    expect(limited.allowed).toBe(false);
  });

  it("returns 429 with Retry-After after N login failures", async () => {
    const email = `bruteforce-${Date.now()}@example.com`;
    const ip = "203.0.113.77";

    let lastStatus = 0;
    for (let i = 0; i < AUTH_RATE_LIMIT.maxFailuresPerAccount; i += 1) {
      const res = await loginHandler(
        makeLoginRequest(email, "WrongPass123!", ip) as never,
      );
      lastStatus = res.status;
      expect(res.status).toBe(401);
    }
    expect(lastStatus).toBe(401);

    const blocked = await loginHandler(
      makeLoginRequest(email, "WrongPass123!", ip) as never,
    );
    const data = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(data.error).toMatch(/trop de tentatives/i);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("uses the same 401 message whether or not the email exists", async () => {
    const missing = await loginHandler(
      makeLoginRequest(
        `missing-${Date.now()}@example.com`,
        "WrongPass123!",
      ) as never,
    );
    const existing = await loginHandler(
      makeLoginRequest("owner@demo.okauto.local", "WrongPass123!") as never,
    );

    expect(missing.status).toBe(401);
    expect(existing.status).toBe(401);
    expect((await missing.json()).error).toBe((await existing.json()).error);
  });

  it("rate-limits closed signup attempts by IP", async () => {
    const previousSignup = process.env.ALLOW_PUBLIC_SIGNUP;
    process.env.ALLOW_PUBLIC_SIGNUP = "false";

    const ip = "203.0.113.88";
    const makeRegister = () =>
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          name: "Test",
          email: "rate-limit-signup@example.com",
          password: "SecurePass123!",
          organizationName: "Test",
        }),
      });

    try {
      for (let i = 0; i < AUTH_RATE_LIMIT.maxFailuresPerIp; i += 1) {
        const res = await registerHandler(makeRegister() as never);
        expect(res.status).toBe(403);
      }

      const blocked = await registerHandler(makeRegister() as never);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("Retry-After")).toBeTruthy();
    } finally {
      if (previousSignup === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
      else process.env.ALLOW_PUBLIC_SIGNUP = previousSignup;
    }
  });
});
