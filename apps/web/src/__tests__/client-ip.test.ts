import { describe, expect, it } from "vitest";
import { getClientIp, isTrustedProxyEnabled } from "@/lib/client-ip";

describe("trusted proxy client IP", () => {
  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(isTrustedProxyEnabled({ TRUST_PROXY: "false" })).toBe(false);
    expect(getClientIp(request, { TRUST_PROXY: "false" })).toBe("unknown");
  });

  it("uses the original client IP from X-Forwarded-For when trusted", () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(
      getClientIp(request, { TRUST_PROXY: "true", NODE_ENV: "test" }),
    ).toBe("203.0.113.9");
  });

  it("defaults to trusting the proxy in production", () => {
    expect(isTrustedProxyEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(isTrustedProxyEnabled({ NODE_ENV: "test" })).toBe(false);
  });
});
