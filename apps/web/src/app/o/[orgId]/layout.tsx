import { prisma } from "@lotpilot/db";
import { requireOrgPage } from "@/server/rsc";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { user, org, role } = await requireOrgPage(orgId);
  const [memberships, unread] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <DashboardShell
      orgId={org.id}
      orgName={org.name}
      role={role}
      user={{ name: user.name, email: user.email, isPlatformAdmin: user.platformRole === "ADMIN" }}
      organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))}
      unreadCount={unread}
    >
      {children}
    </DashboardShell>
  );
}
