import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  AppError,
  hasPermission,
  type ActorType,
  type Permission,
  type Role,
} from "@okauto/shared";
import { EXTENSION_TOKEN_PREFIX, sha256 } from "../lib/tokens.js";

export interface AuthContext {
  userId: string;
  isPlatformAdmin: boolean;
  actorType: Extract<ActorType, "USER" | "EXTENSION">;
  /** Present when authenticated via extension PAT. */
  patId?: string;
  /** Present when authenticated via extension PAT (org is bound to the token). */
  patOrgId?: string;
}

export interface OrgContext {
  orgId: string;
  role: Role;
  membershipId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
    org: OrgContext | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOrg: (permission: Permission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePlatformAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function resolveBearer(app: FastifyInstance, request: FastifyRequest): Promise<AuthContext> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw AppError.unauthorized("Missing bearer token");
  const token = header.slice("Bearer ".length).trim();

  if (token.startsWith(EXTENSION_TOKEN_PREFIX)) {
    const tokenHash = sha256(token);
    const pat = await app.prisma.extensionToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!pat || pat.revokedAt) throw AppError.unauthorized("Invalid extension token");
    if (pat.user.status !== "ACTIVE") throw AppError.unauthorized("Account deactivated");
    // Opportunistic last-used touch; deliberately not awaited.
    app.prisma.extensionToken
      .update({ where: { id: pat.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      userId: pat.userId,
      isPlatformAdmin: false,
      actorType: "EXTENSION",
      patId: pat.id,
      patOrgId: pat.orgId,
    };
  }

  try {
    const payload = app.jwt.verify<{ sub: string }>(token);
    const user = await app.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "ACTIVE") throw AppError.unauthorized("Account unavailable");
    return { userId: user.id, isPlatformAdmin: user.isPlatformAdmin, actorType: "USER" };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized("Invalid or expired access token");
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("auth", null);
  app.decorateRequest("org", null);

  app.decorate("authenticate", async (request: FastifyRequest) => {
    request.auth = await resolveBearer(app, request);
  });

  app.decorate("requireOrg", (permission: Permission) => async (request: FastifyRequest) => {
    if (!request.auth) request.auth = await resolveBearer(app, request);
    const auth = request.auth;

    const orgId = auth.patOrgId ?? (request.headers["x-org-id"] as string | undefined);
    if (!orgId) throw AppError.validation("Missing organization context (x-org-id header)");

    const membership = await app.prisma.membership.findUnique({
      where: { userId_orgId: { userId: auth.userId, orgId } },
      include: { org: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      // Deliberately identical for "no such org" and "not a member" to avoid tenant enumeration.
      throw AppError.forbidden("Organization access denied");
    }
    if (membership.org.status !== "ACTIVE") throw AppError.forbidden("Organization is suspended");

    request.org = { orgId, role: membership.role, membershipId: membership.id };

    if (!hasPermission(membership.role, permission, auth.isPlatformAdmin)) {
      throw AppError.forbidden(`Missing permission: ${permission}`);
    }
  });

  app.decorate("requirePlatformAdmin", async (request: FastifyRequest) => {
    if (!request.auth) request.auth = await resolveBearer(app, request);
    if (!request.auth.isPlatformAdmin || request.auth.actorType !== "USER") {
      throw AppError.forbidden("Platform admin required");
    }
  });
});
