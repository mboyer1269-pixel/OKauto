import { describe, expect, it } from "vitest";
import {
  getClientIp,
  getTrustedProxyHops,
  isTrustedProxyEnabled,
} from "@/lib/client-ip";

const trusted = { TRUST_PROXY: "true", NODE_ENV: "test" };

function requestWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/v1/auth/login", { headers });
}

describe("trusted proxy client IP", () => {
  it("ignores forwarded headers unless the proxy is trusted", () => {
    const request = requestWith({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "x-real-ip": "198.51.100.20",
    });
    expect(isTrustedProxyEnabled({ TRUST_PROXY: "false" })).toBe(false);
    expect(getClientIp(request, { TRUST_PROXY: "false" })).toBe("unknown");
  });

  it("prefers X-Real-IP set by Traefik over a spoofable X-Forwarded-For chain", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, 203.0.113.50",
      "x-real-ip": "192.0.2.80",
    });
    expect(getClientIp(request, trusted)).toBe("192.0.2.80");
  });

  it("uses the rightmost X-Forwarded-For hop when X-Real-IP is absent", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, 203.0.113.50",
    });
    expect(getClientIp(request, trusted)).toBe("203.0.113.50");
  });

  it("does not let a client-spoofed leftmost X-Forwarded-For win", () => {
    const spoofed = "203.0.113.9";
    const realClient = "198.51.100.44";
    const request = requestWith({
      "x-forwarded-for": `${spoofed}, ${realClient}`,
    });
    expect(getClientIp(request, trusted)).toBe(realClient);
    expect(getClientIp(request, trusted)).not.toBe(spoofed);
  });

  it("skips extra trusted proxy hops from the right when configured", () => {
    expect(getTrustedProxyHops({})).toBe(1);
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, 203.0.113.50, 10.0.0.2",
    });
    expect(getClientIp(request, { ...trusted, TRUSTED_PROXY_HOPS: "2" })).toBe(
      "203.0.113.50",
    );
  });

  it("defaults to trusting the proxy in production", () => {
    expect(isTrustedProxyEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(isTrustedProxyEnabled({ NODE_ENV: "test" })).toBe(false);
  });
});
