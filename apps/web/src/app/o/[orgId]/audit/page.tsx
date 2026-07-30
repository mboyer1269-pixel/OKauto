import { prisma } from "@lotpilot/db";
import { Card, EmptyState, Pagination } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireOrgPage } from "@/server/rsc";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  await requireOrgPage(orgId, "MANAGER");

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const where = { organizationId: orgId, ...(q ? { action: { contains: q } } : {}) };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const makeHref = (p: number) =>
    `/o/${orgId}/audit?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        Audit log <span className="text-sm font-normal text-slate-500">({total})</span>
      </h1>
      <form className="flex gap-2" action={`/o/${orgId}/audit`} method="get">
        <input
          className="input max-w-xs"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Filter by action, e.g. listing."
          aria-label="Filter audit log by action"
        />
        <button className="btn-secondary">Filter</button>
      </form>
      <Card>
        {logs.length === 0 ? (
          <EmptyState title="No audit entries" body="Activity in this dealership will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">When</th>
                  <th className="px-3 py-3">Who</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Details</th>
                  <th className="px-3 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{dateTime(log.createdAt)}</td>
                    <td className="px-3 py-2.5">{log.user?.name ?? "System"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{log.action}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {log.entityType ? `${log.entityType}${log.entityId ? ` (${log.entityId.slice(0, 8)}…)` : ""}` : "—"}
                    </td>
                    <td className="max-w-64 truncate px-3 py-2.5 font-mono text-xs text-slate-400">
                      {JSON.stringify(log.data)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">{log.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} makeHref={makeHref} />
      </Card>
    </div>
  );
}
