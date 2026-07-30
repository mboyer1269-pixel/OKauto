import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken } from "../src/lib/tokens.js";
import { backoffDelayMs } from "../src/jobs/queue.js";
import { createAiService } from "../src/services/ai.js";
import { createVinDecoder } from "../src/services/vinDecoder.js";

describe("password hashing", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct horse battery 1");
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("correct horse battery 1", hash)).toBe(true);
    expect(await verifyPassword("wrong password 2", hash)).toBe(false);
  });
  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("access tokens", () => {
  const secret = "unit-test-secret-1234567890";
  it("round-trips claims", async () => {
    const token = await signAccessToken(
      { sub: "u1", email: "a@b.c", name: "A", isPlatformAdmin: true },
      secret,
      60,
    );
    const claims = await verifyAccessToken(token, secret);
    expect(claims).toMatchObject({ sub: "u1", email: "a@b.c", isPlatformAdmin: true });
  });
  it("rejects tampered tokens and wrong secrets", async () => {
    const token = await signAccessToken({ sub: "u1", email: "a@b.c", name: "A", isPlatformAdmin: false }, secret, 60);
    expect(await verifyAccessToken(token + "x", secret)).toBeNull();
    expect(await verifyAccessToken(token, "another-secret-1234567890")).toBeNull();
  });
  it("rejects expired tokens", async () => {
    const token = await signAccessToken({ sub: "u1", email: "a@b.c", name: "A", isPlatformAdmin: false }, secret, -10);
    expect(await verifyAccessToken(token, secret)).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("generates opaque tokens with stable hashes", () => {
    const { token, hash } = generateRefreshToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(generateRefreshToken().token).not.toBe(token);
  });
});

describe("queue backoff", () => {
  it("grows exponentially and caps at one hour", () => {
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(8000);
    expect(backoffDelayMs(30)).toBe(60 * 60 * 1000);
  });
});

describe("AI service fallback", () => {
  it("uses the template provider when no API key is configured", async () => {
    const ai = createAiService({ OPENAI_API_KEY: undefined, OPENAI_BASE_URL: "https://x", OPENAI_MODEL: "m" });
    expect(ai.enabled).toBe(false);
    const result = await ai.generateVehicleDescription(
      { year: 2020, make: "Kia", model: "Soul", priceCents: 1500000 },
      { tone: "PROFESSIONAL", includeDisclaimer: true, maxLength: 2500 },
    );
    expect(result.source).toBe("TEMPLATE");
    expect(result.text).toContain("2020 Kia Soul");
  });

  it("uses the LLM when configured and falls back on failure", async () => {
    const okFetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "LLM copy here" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const ai = createAiService({ OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://x", OPENAI_MODEL: "m" }, okFetch, {
      warn: () => {},
    });
    const result = await ai.generateVehicleDescription(
      { year: 2020, make: "Kia", model: "Soul" },
      { tone: "FRIENDLY", includeDisclaimer: false, maxLength: 2500 },
    );
    expect(result).toEqual({ text: "LLM copy here", source: "AI" });

    const failFetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const aiFail = createAiService({ OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://x", OPENAI_MODEL: "m" }, failFetch, {
      warn: () => {},
    });
    const fallback = await aiFail.generateVehicleDescription(
      { year: 2020, make: "Kia", model: "Soul" },
      { tone: "FRIENDLY", includeDisclaimer: false, maxLength: 2500 },
    );
    expect(fallback.source).toBe("TEMPLATE");
  });
});

describe("VIN decoder service", () => {
  it("returns offline info without network", async () => {
    const decode = createVinDecoder({ enableNhtsa: false });
    const result = await decode("1HGCM82633A004352");
    expect(result.valid).toBe(true);
    expect(result.offline.manufacturer).toBe("Honda");
    expect(result.decoderSource).toBe("OFFLINE");
  });

  it("enriches from NHTSA when enabled", async () => {
    const stub = (async () =>
      new Response(
        JSON.stringify({
          Results: [
            {
              ModelYear: "2003",
              Make: "HONDA",
              Model: "Accord",
              Trim: "EX-V6",
              BodyClass: "Coupe",
              TransmissionStyle: "Automatic",
              FuelTypePrimary: "Gasoline",
              DriveType: "FWD",
              DisplacementL: "3.0",
              EngineCylinders: "6",
              Doors: "2",
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const decode = createVinDecoder({ enableNhtsa: true, fetchImpl: stub });
    const result = await decode("1HGCM82633A004352");
    expect(result.decoderSource).toBe("NHTSA");
    expect(result.decoded).toMatchObject({
      year: 2003,
      make: "Honda",
      model: "Accord",
      bodyStyle: "COUPE",
      transmission: "AUTOMATIC",
      fuelType: "GASOLINE",
      drivetrain: "FWD",
      doors: 2,
    });
    expect(result.decoded?.engine).toBe("3.0L 6-cyl");
  });

  it("flags invalid VINs without calling the network", async () => {
    const decode = createVinDecoder({
      enableNhtsa: true,
      fetchImpl: (() => {
        throw new Error("must not be called");
      }) as unknown as typeof fetch,
    });
    const result = await decode("BADVIN");
    expect(result.valid).toBe(false);
  });
});
