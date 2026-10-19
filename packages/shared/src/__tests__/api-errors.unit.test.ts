import { describe, expect, it } from "vitest";
import {
  ApiErrorCode,
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

  it("prefers a stable code over a payload message", () => {
    expect(
      userFacingApiError(401, {
        code: ApiErrorCode.INVALID_API_KEY,
        error: "Invalid API key",
      }),
    ).toBe(apiErrorMessageFr(ApiErrorCode.INVALID_API_KEY));
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
