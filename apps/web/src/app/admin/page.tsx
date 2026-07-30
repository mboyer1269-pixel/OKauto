import { prisma } from "@lotpilot/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardHeader, StatCard } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireSessionUser } from "@/server/rsc";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireSessionUser();
  if (user.platformRole !== "ADMIN") redirect("/");

  const [orgs, users, vehicles, listings, recentOrgs, recentAudit] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.listing.count(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { memberships: true, vehicles: true, listings: true } } },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { name: true } }, organization: { select: { name: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Platform administration</h1>
        <Link className="text-sm font-semibold text-brand-600 hover:underline" href="/">
          ← Back
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Dealerships" value={orgs} />
        <StatCard label="Users" value={users} />
        <StatCard label="Vehicles" value={vehicles} />
        <StatCard label="Listings" value={listings} />
      </div>

      <Card>
        <CardHeader title="Dealerships" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Members</th>
                <th className="px-3 py-3">Vehicles</th>
                <th className="px-3 py-3">Listings</th>
                <th className="px-3 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrgs.map((org) => (
                <tr key={org.id}>
                  <td className="px-5 py-3">
                    <Link className="font-medium hover:text-brand-600" href={`/o/${org.id}`}>
                      {org.name}
                    </Link>
                    <p className="text-xs text-slate-400">{org.slug}</p>
                  </td>
                  <td className="px-3 py-3">{org._count.memberships}</td>
                  <td className="px-3 py-3">{org._count.vehicles}</td>
                  <td className="px-3 py-3">{org._count.listings}</td>
                  <td className="px-3 py-3 text-slate-500">{dateTime(org.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent platform activity" />
        <ul className="divide-y divide-slate-100">
          {recentAudit.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{log.user?.name ?? "System"}</span>{" "}
                <span className="text-slate-500">{log.action}</span>
                {log.organization ? <span className="text-slate-400"> · {log.organization.name}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{dateTime(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
