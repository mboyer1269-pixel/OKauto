import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Role } from "@okauto/shared";
import { prisma } from "@okauto/db";
import { verifyAccessToken, type AuthUser, type OrgContext } from "../lib/auth.js";
import type { Env } from "../lib/env.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    org?: OrgContext;
    requestId: string;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Unauthorized", code: "AUTH_REQUIRED" });
  }
  const token = header.slice(7);
  try {
    const env = request.server.env as Env;
    const claims = verifyAccessToken(env, token);
    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized", code: "USER_NOT_FOUND" });
    }
    request.user = { id: user.id, email: user.email, name: user.name };
  } catch {
    return reply.code(401).send({ error: "Unauthorized", code: "INVALID_TOKEN" });
  }
}

export function requireOrgPermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized", code: "AUTH_REQUIRED" });
    }
    const orgId =
      (request.params as { orgId?: string }).orgId ??
      (request.headers["x-organization-id"] as string | undefined);
    if (!orgId) {
      return reply.code(400).send({ error: "Organization required", code: "ORG_REQUIRED" });
    }
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: request.user.id,
          organizationId: orgId,
        },
      },
    });
    if (!membership || membership.status !== "active") {
      return reply.code(403).send({ error: "Forbidden", code: "NOT_A_MEMBER" });
    }
    const role = membership.role as Role;
    if (!hasPermission(role, permission)) {
      return reply
        .code(403)
        .send({ error: "Forbidden", code: "MISSING_PERMISSION", details: { permission } });
    }
    request.org = {
      organizationId: orgId,
      role,
      membershipId: membership.id,
    };
  };
}
