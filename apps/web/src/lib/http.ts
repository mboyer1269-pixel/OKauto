import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { error: message, details: details ?? undefined },
    { status },
  );
}

export function fromZod(error: ZodError) {
  return jsonError("Validation failed", 400, error.flatten());
}

export function handleRouteError(err: unknown) {
  if (err instanceof ZodError) return fromZod(err);
  console.error(err);
  return jsonError("Internal server error", 500);
}
