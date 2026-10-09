import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError, z } from "zod";
import {
  handleApiError,
  errorResponse,
  tooManyRequestsResponse,
  InvalidJsonError,
  parseBody,
} from "@/lib/api";

describe("handleApiError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Zod validation messages as 400", async () => {
    const schema = z.object({ email: z.string().email() });
    let zodError: ZodError | undefined;
    try {
      schema.parse({ email: "not-an-email" });
    } catch (error) {
      zodError = error as ZodError;
    }

    const res = handleApiError(zodError);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Les données envoyées sont invalides");
    expect(data.details).toBeTruthy();
    expect(data.correlationId).toBeUndefined();
  });

  it("returns 400 for malformed JSON instead of 500", async () => {
    const res = handleApiError(new InvalidJsonError());
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/JSON/);
    expect(data.correlationId).toBeUndefined();
  });

  it("keeps unique-constraint conflicts as 409", async () => {
    const res = handleApiError(
      new Error("Unique constraint failed on the fields: (`stockNumber`)"),
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("Une fiche avec cette valeur existe déjà");
    expect(data.correlationId).toBeUndefined();
  });

  it("returns a generic French 500 with a correlation id and logs the real error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = new Error(
      "ECONNREFUSED postgres://secret-user:secret-pass@db/okauto",
    );

    const res = handleApiError(secret);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe(
      "Une erreur interne s'est produite. Réessayez plus tard.",
    );
    expect(data.error).not.toContain("ECONNREFUSED");
    expect(data.error).not.toContain("secret-pass");
    expect(data.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.headers.get("x-correlation-id")).toBe(data.correlationId);
    expect(log).toHaveBeenCalledWith(`[api] ${data.correlationId}`, secret);
  });

  it("does not leak a thrown Error message on 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = handleApiError(
      new Error("JWT_SECRET is required in production"),
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).not.toContain("JWT_SECRET");
  });
});

describe("parseBody", () => {
  it("throws InvalidJsonError on malformed JSON", async () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    await expect(parseBody(request)).rejects.toBeInstanceOf(InvalidJsonError);
  });
});

describe("error helpers", () => {
  it("returns intended 4xx messages unchanged", async () => {
    const res = errorResponse("Courriel ou mot de passe invalide", 401);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Courriel ou mot de passe invalide");
  });

  it("sets Retry-After on 429 responses", async () => {
    const res = tooManyRequestsResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect((await res.json()).error).toMatch(/trop de tentatives/i);
  });
});
