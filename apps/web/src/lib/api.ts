import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { hasMinRole, type RoleType } from '@okauto/shared';
import { getAuthFromRequest, type TokenPayload } from './auth';

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    return errorResponse('Validation error', 400, err.errors);
  }
  if (err instanceof Error) {
    if (err.message.includes('Unique constraint')) {
      return errorResponse('A record with this value already exists', 409);
    }
    console.error('API Error:', err);
    return errorResponse(err.message, 500);
  }
  return errorResponse('Internal server error', 500);
}

export type AuthenticatedHandler = (
  request: Request,
  context: { auth: TokenPayload; params?: Record<string, string> }
) => Promise<NextResponse>;

export function withAuth(
  handler: AuthenticatedHandler,
  options?: { minRole?: RoleType }
) {
  return async (
    request: Request,
    segmentData: { params: Promise<Record<string, string>> }
  ) => {
    try {
      const auth = await getAuthFromRequest(request as never);
      if (!auth) {
        return errorResponse('Unauthorized', 401);
      }

      if (options?.minRole && !hasMinRole(auth.role, options.minRole)) {
        return errorResponse('Forbidden', 403);
      }

      const params = await segmentData.params;
      return handler(request, { auth, params });
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
