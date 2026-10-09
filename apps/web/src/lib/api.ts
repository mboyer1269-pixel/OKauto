import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { hasMinRole, isPlatformAdminUserId, type RoleType } from "@okauto/shared";
import {
  getAuthFromRequest,
  isAccessTokenRevoked,
  type TokenPayload,
} from "./auth";
import { ListingGuardError } from "./listing-guards";

const GENERIC_INTERNAL_ERROR =
  "Une erreur interne s'est produite. Réessayez plus tard.";

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
  extra?: { retryAfterSeconds?: number; correlationId?: string },
) {
  const body: Record<string, unknown> = { error: message };
  if (details !== undefined) body.details = details;
  if (extra?.correlationId) body.correlationId = extra.correlationId;

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

export function tooManyRequestsResponse(retryAfterSeconds: number) {
  return errorResponse(
    "Trop de tentatives. Réessayez plus tard.",
    429,
    undefined,
    {
      retryAfterSeconds,
    },
  );
}

function isUniqueConstraintError(err: Error): boolean {
  return (
    err.message.includes("Unique constraint") ||
    ("code" in err && (err as { code?: string }).code === "P2002")
  );
}

export function handleApiError(err: unknown) {
  if (err instanceof ListingGuardError) {
    return NextResponse.json(
      { error: err.message, ...err.extra },
      { status: err.status },
    );
  }
  if (err instanceof InvalidJsonError) {
    return errorResponse(err.message, 400);
  }
  if (err instanceof ZodError) {
    return errorResponse(
      "Les données envoyées sont invalides",
      400,
      err.errors,
    );
  }
  if (err instanceof Error && isUniqueConstraintError(err)) {
    return errorResponse("Une fiche avec cette valeur existe déjà", 409);
  }

  const correlationId = randomUUID();
  console.error(`[api] ${correlationId}`, err);
  return errorResponse(GENERIC_INTERNAL_ERROR, 500, undefined, {
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
        return errorResponse("Authentification requise", 401);
      }
      if (await isAccessTokenRevoked(auth)) {
        return errorResponse("Authentification requise", 401);
      }

      if (options?.minRole && !hasMinRole(auth.role, options.minRole)) {
        return errorResponse("Accès insuffisant", 403);
      }

      if (options?.platformAdmin && !isPlatformAdminUserId(auth.sub)) {
        return errorResponse("Accès insuffisant", 403);
      }

      const params = await segmentData.params;
      return await handler(request, { auth, params });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export class InvalidJsonError extends Error {
  constructor(message = "Le corps de la requête n’est pas un JSON valide") {
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
