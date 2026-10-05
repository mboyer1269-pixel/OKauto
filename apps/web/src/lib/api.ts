import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { hasMinRole, type RoleType } from "@okauto/shared";
import { getAuthFromRequest, type TokenPayload } from "./auth";
import { ListingGuardError } from "./listing-guards";

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof ListingGuardError) {
    return NextResponse.json(
      { error: err.message, ...err.extra },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return errorResponse(
      "Les données envoyées sont invalides",
      400,
      err.errors,
    );
  }
  if (err instanceof Error) {
    if (err.message.includes("Unique constraint")) {
      return errorResponse("Une fiche avec cette valeur existe déjà", 409);
    }
    console.error("API Error:", err);
    return errorResponse(err.message, 500);
  }
  return errorResponse("Erreur interne du serveur", 500);
}

export type AuthenticatedHandler = (
  request: Request,
  context: { auth: TokenPayload; params?: Record<string, string> },
) => Promise<NextResponse>;

export function withAuth(
  handler: AuthenticatedHandler,
  options?: { minRole?: RoleType },
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

      if (options?.minRole && !hasMinRole(auth.role, options.minRole)) {
        return errorResponse("Accès insuffisant", 403);
      }

      const params = await segmentData.params;
      return await handler(request, { auth, params });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
