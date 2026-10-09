import {
  decodeVin,
  decodeVinRequestSchema,
  isValidVinFormat,
  normalizeVin,
  vinDecodeErrorMessageFr,
} from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody } from "@/lib/api";

export const POST = withAuth(async (request) => {
  const body = await parseBody<unknown>(request);
  const { vin } = decodeVinRequestSchema.parse(body);
  const normalized = normalizeVin(vin);

  if (!isValidVinFormat(normalized)) {
    return errorResponse(vinDecodeErrorMessageFr("Invalid VIN format."), 400);
  }

  const decoded = await decodeVin(normalized);
  if (decoded.error) {
    const status = /NHTSA API error/i.test(decoded.error) ? 503 : 400;
    return errorResponse(vinDecodeErrorMessageFr(decoded.error), status);
  }

  return jsonResponse({ decode: decoded });
});
