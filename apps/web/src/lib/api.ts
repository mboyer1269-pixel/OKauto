import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import {
  ApiErrorCode,
  apiErrorMessageFr,
  hasMinRole,
  isPlatformAdminUserId,
  type ApiErrorCodeType,
  type RoleType,
} from "@okauto/shared";
import {
  getAuthFromRequest,
  isAccessTokenRevoked,
  isInvitationScopedToken,
  type TokenPayload,
} from "./auth";
import { ListingGuardError } from "./listing-guards";

type ErrorExtra = {
  retryAfterSeconds?: number;
  correlationId?: string;
  code?: ApiErrorCodeType | string;
};

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
  extra?: ErrorExtra,
) {
  const body: Record<string, unknown> = { error: message };
  if (details !== undefined) body.details = details;
  if (extra?.correlationId) body.correlationId = extra.correlationId;
  if (extra?.code) body.code = extra.code;

  const response = NextResponse.json(body, { status });
  if (extra?.retryAfterSeconds !== undefined) {
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(extra.retryAfterSeconds))),
    );
  }
  if (extra?.correlationId) {
    response.headers.set("x-correlation-id", extra.correlationId);
  }
  return response;
}

export function apiError(
  code: ApiErrorCodeType,
  status: number,
  details?: unknown,
  extra?: Omit<ErrorExtra, "code">,
) {
  return errorResponse(apiErrorMessageFr(code), status, details, {
    ...extra,
    code,
  });
}

export function listingGuardResponse(err: ListingGuardError) {
  const extra = { ...err.extra };
  const code = err.code ?? (typeof extra.code === "string" ? extra.code : undefined);
  delete extra.code;
  return NextResponse.json(
    { error: err.message, ...(code ? { code } : {}), ...extra },
    { status: err.status },
  );
}

export function tooManyRequestsResponse(retryAfterSeconds: number) {
  return apiError(ApiErrorCode.RATE_LIMITED, 429, undefined, {
    retryAfterSeconds,
  });
}

function isUniqueConstraintError(err: Error): boolean {
  return (
    err.message.includes("Unique constraint") ||
    ("code" in err && (err as { code?: string }).code === "P2002")
  );
}

export function handleApiError(err: unknown) {
  if (err instanceof ListingGuardError) {
    return listingGuardResponse(err);
  }
  if (err instanceof InvalidJsonError) {
    return apiError(ApiErrorCode.INVALID_JSON, 400);
  }
  if (err instanceof ZodError) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, 400, err.errors);
  }
  if (err instanceof Error && isUniqueConstraintError(err)) {
    return apiError(ApiErrorCode.CONFLICT_UNIQUE, 409);
  }

  const correlationId = randomUUID();
  console.error(`[api] ${correlationId}`, err);
  return apiError(ApiErrorCode.INTERNAL_ERROR, 500, undefined, {
    correlationId,
  });
}

export type AuthenticatedHandler = (
  request: Request,
  context: { auth: TokenPayload; params?: Record<string, string> },
) => Promise<NextResponse>;

export function withAuth(
  handler: AuthenticatedHandler,
  options?: { minRole?: RoleType; platformAdmin?: boolean },
) {
  return async (
    request: Request,
    segmentData: { params: Promise<Record<string, string>> },
  ) => {
    try {
      const auth = await getAuthFromRequest(request as never);
      if (!auth) {
        return apiError(ApiErrorCode.AUTH_REQUIRED, 401);
      }
      if (isInvitationScopedToken(auth)) {
        return apiError(ApiErrorCode.AUTH_REQUIRED, 401);
      }
      if (await isAccessTokenRevoked(auth)) {
        return apiError(ApiErrorCode.AUTH_REQUIRED, 401);
      }

      if (options?.minRole && !hasMinRole(auth.role, options.minRole)) {
        return apiError(ApiErrorCode.FORBIDDEN, 403);
      }

      if (options?.platformAdmin && !isPlatformAdminUserId(auth.sub)) {
        return apiError(ApiErrorCode.FORBIDDEN, 403);
      }

      const params = await segmentData.params;
      return await handler(request, { auth, params });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export class InvalidJsonError extends Error {
  constructor(message = apiErrorMessageFr(ApiErrorCode.INVALID_JSON)) {
    super(message);
    this.name = "InvalidJsonError";
  }
}

export async function parseBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new InvalidJsonError();
    }
    throw err;
  }
}
