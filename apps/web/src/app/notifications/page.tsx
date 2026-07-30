import { prisma } from "@lotpilot/db";
import Link from "next/link";
import { NotificationsList } from "@/components/notifications-list";
import { requireSessionUser } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { organization: { select: { id: true, name: true } } },
  });
  const firstMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        <Link
          className="text-sm font-semibold text-brand-600 hover:underline"
          href={firstMembership ? `/o/${firstMembership.organizationId}` : "/"}
        >
          ← Back to dashboard
        </Link>
      </div>
      <NotificationsList
        notifications={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data as Record<string, unknown>,
          orgId: n.organizationId,
          orgName: n.organization?.name ?? null,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
