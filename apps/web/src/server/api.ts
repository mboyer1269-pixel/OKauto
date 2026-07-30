import { roleAtLeast, type OrgRole } from "@lotpilot/core";
import { prisma, type Membership, type User } from "@lotpilot/db";
import { createHash, randomUUID } from "node:crypto";
import { type z } from "zod";
import { clientIp } from "./ratelimit";
import { sessionFromRequest } from "./session";

// ---------- Errors & responses ----------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Authentication required") => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have permission to do this") => new ApiError(403, "forbidden", msg);
export const notFound = (msg = "Not found") => new ApiError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details);
export const conflict = (msg: string) => new ApiError(409, "conflict", msg);
export const tooManyRequests = (msg = "Too many requests, slow down") => new ApiError(429, "rate_limited", msg);

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/**
 * Wrap a route handler with error mapping + structured request logging.
 * All /api/v1 handlers go through this.
 */
export function handler<Ctx>(
  fn: (req: Request, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    try {
      const res = await fn(req, ctx);
      res.headers.set("x-request-id", requestId);
      logRequest(req, res.status, started, requestId);
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
        logRequest(req, err.status, started, requestId);
        return json(
          { error: { code: err.code, message: err.message, details: err.details ?? undefined } },
          { status: err.status, headers: { "x-request-id": requestId } },
        );
      }
      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          method: req.method,
          url: req.url,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
      );
      return json(
        { error: { code: "internal", message: "Internal server error" } },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  };
}

function logRequest(req: Request, status: number, started: number, requestId: string): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(
    JSON.stringify({
      level: status >= 500 ? "error" : "info",
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status,
      durationMs: Date.now() - started,
    }),
  );
}

// ---------- Validation ----------

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

// ---------- Auth guards ----------

export async function requireUser(req: Request): Promise<User> {
  const session = await sessionFromRequest(req);
  if (!session) throw unauthorized();
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw unauthorized("Session user no longer exists");
  return user;
}

export interface OrgContext {
  user: User;
  membership: Membership;
}

export async function requireOrgRole(
  req: Request,
  orgId: string,
  minimumRole: OrgRole = "SALESPERSON",
): Promise<OrgContext> {
  const user = await requireUser(req);
  if (user.platformRole === "ADMIN") {
    const anyMembership = await prisma.membership.findFirst({
      where: { userId: user.id, organizationId: orgId },
    });
    return {
      user,
      membership:
        anyMembership ??
        ({ id: "admin", userId: user.id, organizationId: orgId, role: "OWNER", createdAt: new Date() } as Membership),
    };
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
  });
  if (!membership) throw notFound("Organization not found");
  if (!roleAtLeast(membership.role, minimumRole)) throw forbidden();
  return { user, membership };
}

export async function requirePlatformAdmin(req: Request): Promise<User> {
  const user = await requireUser(req);
  if (user.platformRole !== "ADMIN") throw forbidden("Platform admin only");
  return user;
}

// ---------- Extension token auth ----------

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface TokenContext {
  user: User;
  organizationId: string;
  role: OrgRole;
  tokenId: string;
}

export async function requireApiToken(req: Request): Promise<TokenContext> {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw unauthorized("Missing bearer token");
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(match[1]!.trim()) },
    include: { user: true },
  });
  if (!token || token.revokedAt) throw unauthorized("Invalid or revoked token");
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: token.userId, organizationId: token.organizationId } },
  });
  if (!membership) throw unauthorized("Token owner is no longer a member of the organization");
  // Fire-and-forget usage timestamp (throttled to once a minute).
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: token.user, organizationId: token.organizationId, role: membership.role, tokenId: token.id };
}

// ---------- Audit ----------

export async function audit(
  req: Request,
  entry: {
    organizationId?: string | null;
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      data: JSON.parse(JSON.stringify(entry.data ?? {})),
      ip: clientIp(req),
    },
  });
}

// ---------- Pagination ----------

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageParams(url: URL, defaultSize = 25, maxSize = 100): PageParams {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    maxSize,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? String(defaultSize), 10) || defaultSize),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
