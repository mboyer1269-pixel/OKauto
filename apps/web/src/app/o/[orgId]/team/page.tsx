import { prisma } from "@lotpilot/db";
import { TeamManager } from "@/components/team-manager";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, role } = await requireOrgPage(orgId, "MANAGER");

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invitation.findMany({
      where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <TeamManager
      orgId={orgId}
      currentUserId={user.id}
      actorRole={role}
      members={members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.createdAt.toISOString(),
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }))}
    />
  );
}
