import {
  decodeVin,
  decodeVinRequestSchema,
  isValidVinFormat,
  normalizeVin,
  vinDecodeErrorMessageFr,
  vinDecodeIsRetryable,
} from "@okauto/shared";
import { withAuth, jsonResponse, errorResponse, parseBody, tooManyRequestsResponse } from "@/lib/api";
import { checkVinDecodeRateLimit } from "@/lib/rate-limit";

export const POST = withAuth(async (request, { auth }) => {
  const limited = await checkVinDecodeRateLimit({
    orgId: auth.orgId,
    userId: auth.sub,
  });
  if (!limited.allowed) {
    return tooManyRequestsResponse(limited.retryAfterSeconds);
  }

  const body = await parseBody<unknown>(request);
  const { vin } = decodeVinRequestSchema.parse(body);
  const normalized = normalizeVin(vin);

  if (!isValidVinFormat(normalized)) {
    return errorResponse(vinDecodeErrorMessageFr("Invalid VIN format."), 400);
  }

  const decoded = await decodeVin(normalized);
  if (decoded.error) {
    const status = vinDecodeIsRetryable(decoded) ? 503 : 400;
    return errorResponse(vinDecodeErrorMessageFr(decoded.error), status);
  }

  return jsonResponse({ decode: decoded });
});
