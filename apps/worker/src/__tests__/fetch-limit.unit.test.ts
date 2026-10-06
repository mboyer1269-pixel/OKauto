import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTextLimited } from "../fetch-limit.js";

describe("fetchTextLimited", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SYNC_FETCH_MAX_BYTES;
    delete process.env.SYNC_FETCH_TIMEOUT_MS;
  });

  it("returns text from a fetch mock without a body stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://mock.test/feed",
        headers: { get: () => "application/json" },
        text: async () => '{"ok":true}',
      }),
    );
    const result = await fetchTextLimited("https://mock.test/feed");
    expect(result.body).toBe('{"ok":true}');
    expect(result.contentType).toBe("application/json");
  });

  it("rejects oversize responses", async () => {
    process.env.SYNC_FETCH_MAX_BYTES = "8";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://mock.test/feed",
        headers: {
          get: (name: string) => (name === "content-length" ? "99" : null),
        },
        text: async () => "too-big-payload",
      }),
    );
    await expect(fetchTextLimited("https://mock.test/feed")).rejects.toThrow(
      /exceeded 8 bytes/,
    );
  });

  it("throws HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
      }),
    );
    await expect(fetchTextLimited("https://mock.test/feed")).rejects.toThrow(
      "HTTP 500",
    );
  });
});
