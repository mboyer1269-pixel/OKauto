import { afterEach, describe, expect, it } from "vitest";
import { getClientIp, isTrustedProxyEnabled } from "@/lib/client-ip";

describe("trusted proxy client IP", () => {
  const previous = process.env.TRUST_PROXY;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    process.env.TRUST_PROXY = "false";
    const request = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(isTrustedProxyEnabled()).toBe(false);
    expect(getClientIp(request)).toBe("unknown");
  });

  it("uses the original client IP from X-Forwarded-For when trusted", () => {
    process.env.TRUST_PROXY = "true";
    const request = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("defaults to trusting the proxy in production", () => {
    delete process.env.TRUST_PROXY;
    process.env.NODE_ENV = "production";
    expect(isTrustedProxyEnabled()).toBe(true);
  });
});
