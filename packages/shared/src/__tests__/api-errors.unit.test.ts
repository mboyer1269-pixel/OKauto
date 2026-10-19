import { describe, expect, it } from "vitest";
import {
  ApiErrorCode,
  API_ERROR_MESSAGES_FR,
  apiErrorMessageFr,
  chromeRuntimeErrorFr,
  userFacingApiError,
} from "../api-errors";

describe("API error catalog", () => {
  it("keeps machine-readable codes stable", () => {
    expect(ApiErrorCode.INVALID_API_KEY).toBe("INVALID_API_KEY");
    expect(ApiErrorCode.VEHICLE_NOT_FOUND).toBe("VEHICLE_NOT_FOUND");
    expect(apiErrorMessageFr(ApiErrorCode.INVALID_API_KEY)).toMatch(
      /Clé API refusée ou révoquée/,
    );
  });

  it("maps legacy English API strings to French for older servers", () => {
    expect(
      userFacingApiError(401, { error: "Invalid API key" }),
    ).toMatch(/Clé API refusée ou révoquée/);
    expect(
      userFacingApiError(401, { error: "API key required" }),
    ).toMatch(/Clé API manquante/);
    expect(
      userFacingApiError(404, { error: "Vehicle not found" }),
    ).toMatch(/Véhicule introuvable/);
  });

  it("maps English leftovers via code, but keeps a specific French server message", () => {
    expect(
      userFacingApiError(401, {
        code: ApiErrorCode.INVALID_API_KEY,
        error: "Invalid API key",
      }),
    ).toBe(apiErrorMessageFr(ApiErrorCode.INVALID_API_KEY));
  });

  it("keeps the duplicate-listing publisher on a 409", () => {
    const server =
      "Une annonce active existe déjà pour ce véhicule (publiée par Marie Tremblay). Anti-doublon d’équipe.";
    expect(
      userFacingApiError(409, {
        code: ApiErrorCode.ACTIVE_LISTING_EXISTS,
        error: server,
      }),
    ).toBe(server);
    expect(
      userFacingApiError(409, {
        code: ApiErrorCode.VEHICLE_NOT_AVAILABLE,
        error:
          "Ce véhicule n’est plus en vente et ne peut pas être publié.",
      }),
    ).toMatch(/n’est plus en vente/);
  });

  it("does not map generic English leftovers to the wrong catalog line", () => {
    expect(userFacingApiError(401, { error: "Unauthorized" })).toBe(
      apiErrorMessageFr(ApiErrorCode.AUTH_REQUIRED),
    );
    expect(userFacingApiError(401, { error: "Unauthorized" })).not.toMatch(
      /désactivé/,
    );
    expect(userFacingApiError(500, { error: "Unknown error" })).toBe(
      apiErrorMessageFr(ApiErrorCode.INTERNAL_ERROR),
    );
    expect(userFacingApiError(500, { error: "Unknown error" })).not.toMatch(
      /NIV/,
    );
  });

  it("uses typographic apostrophes and a final period on every catalog line", () => {
    for (const [code, message] of Object.entries(API_ERROR_MESSAGES_FR)) {
      expect(message, code).toMatch(/[.!?]$/);
      expect(message, code).not.toMatch(/'/);
    }
  });

  it("translates Chrome runtime errors the user can see", () => {
    expect(
      chromeRuntimeErrorFr(
        "Could not establish connection. Receiving end does not exist.",
      ),
    ).toMatch(/Connexion à l’extension perdue/);
    expect(chromeRuntimeErrorFr("Extension context invalidated.")).toMatch(
      /mise à jour/,
    );
  });
});
