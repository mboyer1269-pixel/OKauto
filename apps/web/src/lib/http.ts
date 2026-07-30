/** HTTP helpers: consistent JSON envelopes and error handling for route handlers. */
import { NextResponse } from 'next/server';
import type { ZodError, ZodSchema } from 'zod';
import { formatZodError } from '@okauto/shared';
import { logger } from './logger';

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export const httpErrors = {
  badRequest: (message = 'Bad request', details?: unknown) =>
    new ApiHttpError(400, 'bad_request', message, details),
  unauthorized: (message = 'Authentication required') =>
    new ApiHttpError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have permission to do that') =>
    new ApiHttpError(403, 'forbidden', message),
  notFound: (message = 'Not found') => new ApiHttpError(404, 'not_found', message),
  conflict: (message = 'Conflict', details?: unknown) =>
    new ApiHttpError(409, 'conflict', message, details),
  unprocessable: (message = 'Unprocessable', details?: unknown) =>
    new ApiHttpError(422, 'unprocessable', message, details),
  internal: (message = 'Something went wrong') => new ApiHttpError(500, 'internal', message),
};

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiHttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  logger.error('Unhandled API error', { error: String(error) });
  return NextResponse.json(
    { error: { code: 'internal', message: 'Something went wrong' } },
    { status: 500 },
  );
}

/** Wrap a route handler so thrown ApiHttpErrors become clean JSON responses. */
export function handler<Args extends unknown[]>(
  fn: (req: Request, ...args: Args) => Promise<NextResponse>,
): (req: Request, ...args: Args) => Promise<NextResponse> {
  return async (req: Request, ...args: Args) => {
    try {
      return await fn(req, ...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw httpErrors.badRequest('Invalid JSON body');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const formatted = formatZodError(result.error as ZodError);
    throw httpErrors.unprocessable(formatted.message, formatted.details);
  }
  return result.data;
}
