/** Organization membership + RBAC resolution helpers for route handlers. */
import { prisma, type Role } from '@okauto/db';
import { can, canAct, type Action } from '@okauto/shared';
import { httpErrors } from './http';
import type { AuthedUser } from './auth';

export interface OrgContext {
  user: AuthedUser;
  organizationId: string;
  role: Role;
}

/** Resolve the caller's membership in an org, or throw 403/404. SUPERADMIN bypasses. */
export async function requireOrgContext(
  user: AuthedUser,
  organizationId: string,
): Promise<OrgContext> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw httpErrors.notFound('Organization not found');

  if (user.isSuperAdmin) {
    return { user, organizationId, role: 'SUPERADMIN' };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId } },
  });
  if (!membership) throw httpErrors.forbidden('You are not a member of this organization');
  return { user, organizationId, role: membership.role };
}

export function assertCan(ctx: OrgContext, action: Action): void {
  if (!can(ctx.role, action)) {
    throw httpErrors.forbidden(`Missing permission: ${action}`);
  }
}

export function assertCanAct(
  ctx: OrgContext,
  base: 'listing:read' | 'listing:update' | 'listing:delete' | 'analytics:read',
  isOwner: boolean,
): void {
  if (!canAct(ctx.role, base, isOwner)) {
    throw httpErrors.forbidden(`Missing permission: ${base}`);
  }
}
