import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;

describe("extension CORS middleware", () => {
  it("authorizes Chrome extension preflight requests", () => {
    const response = middleware(
      new NextRequest("https://suivia.ca/api/v1/extension", {
        method: "OPTIONS",
        headers: {
          origin: extensionOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-api-key",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      extensionOrigin,
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "X-API-Key",
    );
  });

  it("adds CORS headers to extension API responses", () => {
    const response = middleware(
      new NextRequest("https://suivia.ca/api/v1/extension", {
        headers: { origin: extensionOrigin },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(
      extensionOrigin,
    );
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("does not authorize arbitrary website origins", () => {
    const response = middleware(
      new NextRequest("https://suivia.ca/api/v1/extension", {
        method: "OPTIONS",
        headers: { origin: "https://untrusted.example" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});
