"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, PageHeader, Spinner } from "@/components/ui";
import { formatDateTime, humanize, statusColor } from "@/lib/format";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  vertical: string;
  createdAt: string;
  _count: { memberships: number; vehicles: number; listings: number };
}

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  actorType: string;
  createdAt: string;
  actorUser: { email: string } | null;
  org: { name: string } | null;
}

interface JobRow {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export default function AdminPage() {
  const { api, user } = useAuth();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [deadJobs, setDeadJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.isPlatformAdmin) return;
    setLoading(true);
    try {
      const [s, o, a, j] = await Promise.all([
        api<Record<string, number>>("/admin/stats"),
        api<{ orgs: OrgRow[] }>("/admin/orgs"),
        api<{ items: AuditRow[] }>("/admin/audit-logs?limit=25"),
        api<{ jobs: JobRow[] }>("/admin/jobs?status=DEAD"),
      ]);
      setStats(s);
      setOrgs(o.orgs);
      setAudits(a.items);
      setDeadJobs(j.jobs);
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user?.isPlatformAdmin) {
    return (
      <div>
        <PageHeader title="Admin" />
        <Card><p className="text-sm text-ink-400">Platform administrators only.</p></Card>
      </div>
    );
  }
  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Platform admin" subtitle="All organizations, audit trail, and job queue health" />

      {stats ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
          {Object.entries(stats).map(([k, v]) => (
            <Card key={k} className="p-4 text-center">
              <p className="text-2xl font-black">{v}</p>
              <p className="text-xs uppercase text-ink-400">{k}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Organizations</h2>
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-lg bg-ink-900/60 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-xs text-ink-400">
                    {o.slug} • {humanize(o.vertical)} • {o._count.memberships} members • {o._count.vehicles} vehicles • {o._count.listings} listings
                  </p>
                </div>
                <Badge colorClass={statusColor(o.status)}>{humanize(o.status)}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Dead-letter jobs</h2>
          {deadJobs.length === 0 ? (
            <p className="text-sm text-ink-400">No dead jobs. The queue is healthy.</p>
          ) : (
            <ul className="space-y-2">
              {deadJobs.map((j) => (
                <li key={j.id} className="rounded-lg bg-red-900/20 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{j.kind} <span className="text-xs text-ink-400">({j.attempts} attempts)</span></p>
                    <Button size="sm" variant="secondary" onClick={() => void api(`/admin/jobs/${j.id}/requeue`, { method: "POST", body: {} }).then(load)}>
                      Requeue
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-red-300">{j.lastError}</p>
                  <p className="text-xs text-ink-600">{formatDateTime(j.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-bold">Recent audit events</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-400">
              <th className="pb-2">When</th>
              <th className="pb-2">Org</th>
              <th className="pb-2">Actor</th>
              <th className="pb-2">Action</th>
              <th className="pb-2">Entity</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id} className="border-t border-ink-700/40">
                <td className="py-1.5 text-ink-400">{formatDateTime(a.createdAt)}</td>
                <td className="py-1.5">{a.org?.name ?? "—"}</td>
                <td className="py-1.5">{a.actorUser?.email ?? a.actorType}</td>
                <td className="py-1.5 font-mono text-xs">{a.action}</td>
                <td className="py-1.5 text-ink-400">{a.entityType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
