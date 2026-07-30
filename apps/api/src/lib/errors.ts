export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details),
  unauthorized: (message = "Authentication required") => new ApiError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to perform this action") =>
    new ApiError(403, "FORBIDDEN", message),
  notFound: (message = "Resource not found") => new ApiError(404, "NOT_FOUND", message),
  conflict: (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details),
  unprocessable: (message: string, details?: unknown) => new ApiError(422, "VALIDATION_ERROR", message, details),
  tooMany: (message = "Too many requests") => new ApiError(429, "RATE_LIMITED", message),
  internal: (message = "Internal server error") => new ApiError(500, "INTERNAL", message),
};

import type { z } from "zod";

/** Parse `data` with `schema` or throw a 422 ApiError with issue details. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw errors.unprocessable(
      "Request validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
