import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { OrgRole } from "@openlot/shared";
import type { Db } from "../db/client.js";
import { orgMemberships } from "../db/schema.js";
import { errors } from "../lib/errors.js";
import type { AccessTokenClaims } from "../lib/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AccessTokenClaims | null;
  }
}

const ROLE_RANK: Record<OrgRole, number> = { SALESPERSON: 1, MANAGER: 2, OWNER: 3 };

export function requireUser(request: FastifyRequest): AccessTokenClaims {
  if (!request.auth) throw errors.unauthorized();
  return request.auth;
}

export interface MembershipContext {
  user: AccessTokenClaims;
  orgId: string;
  role: OrgRole;
  /** True when access was granted via platform-admin override. */
  viaPlatformAdmin: boolean;
}

/**
 * Assert the authenticated user is a member of `orgId` with at least
 * `minRole`. Platform admins may access any organization (read/admin ops).
 */
export async function requireMembership(
  db: Db,
  request: FastifyRequest,
  orgId: string,
  minRole: OrgRole = "SALESPERSON",
): Promise<MembershipContext> {
  const user = requireUser(request);
  const [membership] = await db
    .select({ role: orgMemberships.role })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.userId, user.sub)))
    .limit(1);

  if (!membership) {
    if (user.isPlatformAdmin) {
      return { user, orgId, role: "OWNER", viaPlatformAdmin: true };
    }
    throw errors.forbidden("You are not a member of this organization");
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw errors.forbidden(`This action requires the ${minRole} role`);
  }
  return { user, orgId, role: membership.role, viaPlatformAdmin: false };
}

export function requirePlatformAdmin(request: FastifyRequest): AccessTokenClaims {
  const user = requireUser(request);
  if (!user.isPlatformAdmin) throw errors.forbidden("Platform administrator access required");
  return user;
}
