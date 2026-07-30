export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UPSTREAM_ERROR",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError("VALIDATION_ERROR", message, 400, details);
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "Insufficient permissions"): AppError {
    return new AppError("FORBIDDEN", message, 403);
  }

  static notFound(message = "Resource not found"): AppError {
    return new AppError("NOT_FOUND", message, 404);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError("CONFLICT", message, 409, details);
  }

  static invalidTransition(message: string): AppError {
    return new AppError("INVALID_TRANSITION", message, 422);
  }

  static upstream(message: string, details?: unknown): AppError {
    return new AppError("UPSTREAM_ERROR", message, 502, details);
  }
}

export function toErrorBody(err: unknown): ApiErrorBody {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message, details: err.details } };
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "FORBIDDEN") return { error: { code: "FORBIDDEN", message: (err as Error).message } };
  if (code === "INVALID_TRANSITION") {
    return { error: { code: "INVALID_TRANSITION", message: (err as Error).message } };
  }
  return { error: { code: "INTERNAL", message: "Unexpected server error" } };
}

export function statusCodeFor(err: unknown): number {
  if (err instanceof AppError) return err.statusCode;
  const code = (err as { code?: string } | null)?.code;
  if (code === "FORBIDDEN") return 403;
  if (code === "INVALID_TRANSITION") return 422;
  return 500;
}
