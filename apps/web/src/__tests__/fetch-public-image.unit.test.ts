import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchPublicImage,
  isPrivateHostname,
  PUBLIC_IMAGE_EXTENSIONS,
} from "@/lib/fetch-public-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPublicImage", () => {
  it("follows an https CDN redirect and rejects a private hop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/car.jpg" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const image = await fetchPublicImage(
      new URL("https://photos.example.com/redirect"),
    );
    expect(image?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(PUBLIC_IMAGE_EXTENSIONS["image/jpeg"]).toBe("jpg");
  });

  it("does not follow a redirect to a private host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/secret.jpg" },
        }),
      ),
    );
    expect(
      await fetchPublicImage(new URL("https://photos.example.com/redirect")),
    ).toBeNull();
    expect(isPrivateHostname("192.168.1.10")).toBe(true);
  });
});
