import { ApiErrorCode } from "@okauto/shared";
import { authenticateApiKey } from "./auth";
import { apiError } from "./api";

export async function authenticateExtensionApiKey(apiKey: string | null) {
  if (!apiKey) {
    return {
      ok: false as const,
      response: apiError(ApiErrorCode.API_KEY_REQUIRED, 401),
    };
  }
  const auth = await authenticateApiKey(apiKey);
  if (!auth) {
    return {
      ok: false as const,
      response: apiError(ApiErrorCode.INVALID_API_KEY, 401),
    };
  }
  return { ok: true as const, auth };
}
