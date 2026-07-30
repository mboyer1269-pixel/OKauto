import { prisma } from "@lotpilot/db";
import { Card, CardHeader, StatCard, StatusBadge } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgPage(orgId, "MANAGER");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [members, listings, posted30, sold30, priceChanges30] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.listing.findMany({
      where: { organizationId: orgId },
      select: {
        userId: true,
        status: true,
        createdAt: true,
        postedAt: true,
        delistedAt: true,
        updatedAt: true,
      },
    }),
    prisma.listing.count({ where: { organizationId: orgId, postedAt: { gte: thirtyDaysAgo } } }),
    prisma.vehicle.count({
      where: { organizationId: orgId, status: "SOLD", soldAt: { gte: thirtyDaysAgo } },
    }),
    prisma.priceChange.count({
      where: { vehicle: { organizationId: orgId }, detectedAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const rows = members
    .map((m) => {
      const mine = listings.filter((l) => l.userId === m.userId);
      const posted = mine.filter((l) => l.postedAt != null);
      const times = posted
        .map((l) => l.postedAt!.getTime() - l.createdAt.getTime())
        .filter((t) => t >= 0);
      const last = mine.reduce<Date | null>(
        (acc, l) => (!acc || l.updatedAt > acc ? l.updatedAt : acc),
        null,
      );
      return {
        user: m.user,
        role: m.role,
        active: mine.filter((l) => l.status === "POSTED").length,
        pendingDelist: mine.filter((l) => l.status === "DELIST_REQUESTED").length,
        posted30: posted.filter((l) => l.postedAt! >= thirtyDaysAgo).length,
        totalPosted: posted.length,
        avgMinutesToPost: times.length
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60000)
          : null,
        lastActivity: last,
      };
    })
    .sort((a, b) => b.active - a.active);

  const maxActive = Math.max(1, ...rows.map((r) => r.active));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Team analytics</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Posted (30 days)" value={posted30} tone="good" />
        <StatCard label="Sold (30 days)" value={sold30} />
        <StatCard label="Price changes (30 days)" value={priceChanges30} />
        <StatCard label="Team members" value={members.length} />
      </div>

      <Card>
        <CardHeader
          title="Salesperson performance"
          subtitle="Active Marketplace listings, 30-day posting volume, and speed from prep to post"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Salesperson</th>
                <th className="px-3 py-3">Active listings</th>
                <th className="px-3 py-3">Posted (30d)</th>
                <th className="px-3 py-3">All-time posted</th>
                <th className="px-3 py-3">Pending delists</th>
                <th className="px-3 py-3">Avg. time to post</th>
                <th className="px-3 py-3">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.user.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{r.user.name}</p>
                    <p className="text-xs text-slate-400">
                      {r.user.email} · <StatusBadge status={r.role} />
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden
                        className="h-2 rounded-full bg-brand-500"
                        style={{ width: `${Math.max(4, (r.active / maxActive) * 96)}px` }}
                      />
                      <span className="font-semibold">{r.active}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">{r.posted30}</td>
                  <td className="px-3 py-3">{r.totalPosted}</td>
                  <td
                    className={`px-3 py-3 ${r.pendingDelist > 0 ? "font-semibold text-red-600" : ""}`}
                  >
                    {r.pendingDelist}
                  </td>
                  <td className="px-3 py-3">
                    {r.avgMinutesToPost != null ? `${r.avgMinutesToPost} min` : "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {r.lastActivity ? timeAgo(r.lastActivity) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
