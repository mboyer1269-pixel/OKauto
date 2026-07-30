/** Server-component helpers for resolving the current user's org context. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, type Role } from '@okauto/db';
import { getCurrentUser } from './auth';

const ACTIVE_ORG_COOKIE = 'okauto_org';

export interface DashboardSession {
  user: { id: string; name: string; email: string; isSuperAdmin: boolean };
  memberships: Array<{ organizationId: string; name: string; slug: string; role: Role }>;
  activeOrg: { id: string; name: string; slug: string; role: Role };
}

/** Loads the dashboard session or redirects to /login. */
export async function requireDashboardSession(): Promise<DashboardSession> {
  const session = await getCurrentUser();
  if (!session) redirect('/login');

  const memberships = await prisma.membership.findMany({
    where: { userId: session.sub },
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length === 0) {
    // Authenticated but no org — send to a create-org flow (register handles owner path).
    redirect('/onboarding');
  }

  const store = await cookies();
  const activeId = store.get(ACTIVE_ORG_COOKIE)?.value;
  const active =
    memberships.find((m) => m.organizationId === activeId) ?? memberships[0]!;

  return {
    user: {
      id: session.sub,
      name: session.name,
      email: session.email,
      isSuperAdmin: session.isSuperAdmin,
    },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
    })),
    activeOrg: {
      id: active.organizationId,
      name: active.organization.name,
      slug: active.organization.slug,
      role: active.role,
    },
  };
}

export { ACTIVE_ORG_COOKIE };
