import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches bearer + org headers and parses JSON", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const result = await apiFetch<{ ok: boolean }>({ accessToken: "tok", orgId: "org-1" }, "/vehicles");
    expect(result.ok).toBe(true);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-org-id"]).toBe("org-1");
  });

  it("retries once after refresh on 401", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n += 1;
      if (n === 1) return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "expired" } }), { status: 401 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const refresh = vi.fn(async () => "fresh-token");
    const result = await apiFetch<{ ok: boolean }>({ accessToken: "stale", orgId: null }, "/vehicles", { onUnauthorized: refresh });
    expect(result.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(n).toBe(2);
  });

  it("throws ApiError with server code on failure", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ error: { code: "CONFLICT", message: "duplicate listing" } }), { status: 409 }),
    );
    await expect(apiFetch({ accessToken: null, orgId: null }, "/x")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    } satisfies Partial<ApiError>);
  });
});
