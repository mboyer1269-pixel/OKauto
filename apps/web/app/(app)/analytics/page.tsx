"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Badge, Card, PageHeader, Select, Spinner } from "@/components/ui";
import { formatDateTime, humanize, statusColor } from "@/lib/format";

interface SalespersonRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  queueDepth: number;
  series: { day: string; toStatus: string; count: number }[];
}

interface SyncSource {
  id: string;
  name: string;
  type: string;
  status: string;
  scheduleMinutes: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  vehicleCount: number;
  dueForSync: boolean;
}

export default function AnalyticsPage() {
  const { api, activeRole } = useAuth();
  const [days, setDays] = useState(7);
  const [salespeople, setSalespeople] = useState<SalespersonRow[] | null>(null);
  const [sources, setSources] = useState<SyncSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = activeRole === "ORG_OWNER" || activeRole === "ORG_MANAGER";

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [sp, sh] = await Promise.all([
        api<{ salespeople: SalespersonRow[] }>(`/analytics/salespeople?days=${days}`),
        api<{ sources: SyncSource[] }>("/analytics/sync-health"),
      ]);
      setSalespeople(sp.salespeople);
      setSources(sh.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  }, [api, allowed, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const chart = useMemo(() => buildChartData(salespeople ?? [], days), [salespeople, days]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <Card><p className="text-sm text-ink-400">Analytics are available to owners and managers.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Team listing activity and sync health"
        actions={
          <>
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </Select>
            <a
              href={`/api/v1/analytics/salespeople.csv?days=${days}`}
              className="rounded-lg bg-ink-700 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-ink-600"
              download
            >
              Export CSV
            </a>
          </>
        }
      />

      {error ? <p role="alert" className="mb-4 text-sm text-red-300">{error}</p> : null}
      {!salespeople ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="mb-1 font-bold">Listings published per day</h2>
            <p className="mb-4 text-xs text-ink-400">LIVE transitions per salesperson. Hover bars for values.</p>
            {chart.maxTotal === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">No listing activity in this range yet.</p>
            ) : (
              <div>
                <div className="flex items-end gap-1" role="img" aria-label="Bar chart of listings per day per salesperson">
                  {chart.days.map((day) => (
                    <div key={day.iso} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-36 w-full flex-col-reverse items-stretch justify-start gap-px">
                        {chart.members.map((member, mi) => {
                          const value = day.byMember[member.userId] ?? 0;
                          if (value === 0) return null;
                          const height = Math.max(6, (value / chart.maxTotal) * 100);
                          return (
                            <div
                              key={member.userId}
                              title={`${member.name}: ${value} on ${day.iso}`}
                              style={{ height: `${height}%`, backgroundColor: MEMBER_COLORS[mi % MEMBER_COLORS.length] }}
                              className="w-full rounded-sm"
                            />
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-ink-600">{day.label}</span>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 flex flex-wrap gap-3">
                  {chart.members.map((m, i) => (
                    <li key={m.userId} className="flex items-center gap-1.5 text-xs text-ink-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }} aria-hidden />
                      {m.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-bold">Per-salesperson totals ({days}d)</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-400">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Live</th>
                    <th className="pb-2">Queued</th>
                    <th className="pb-2">Removed</th>
                    <th className="pb-2">Queue depth</th>
                  </tr>
                </thead>
                <tbody>
                  {salespeople.map((sp) => {
                    const totals = { LIVE: 0, QUEUED: 0, REMOVED: 0 };
                    for (const row of sp.series) totals[row.toStatus as keyof typeof totals] += row.count;
                    return (
                      <tr key={sp.userId} className="border-t border-ink-700/40">
                        <td className="py-2">
                          <p className="font-semibold">{sp.name}</p>
                          <p className="text-xs text-ink-400">{humanize(sp.role)}</p>
                        </td>
                        <td className="py-2 font-bold text-emerald-300">{totals.LIVE}</td>
                        <td className="py-2">{totals.QUEUED}</td>
                        <td className="py-2">{totals.REMOVED}</td>
                        <td className="py-2">{sp.queueDepth}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <Card>
              <h2 className="mb-3 font-bold">Sync health</h2>
              {!sources ? (
                <Spinner />
              ) : (
                <ul className="space-y-2">
                  {sources.map((s) => (
                    <li key={s.id} className="rounded-lg bg-ink-900/60 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{s.name}</p>
                        <div className="flex items-center gap-2">
                          {s.dueForSync ? <Badge colorClass="bg-amber-900/60 text-amber-300">due</Badge> : null}
                          {s.lastStatus ? <Badge colorClass={statusColor(s.lastStatus)}>{humanize(s.lastStatus)}</Badge> : null}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-ink-400">
                        {s.type} • {s.vehicleCount} vehicles • last run {s.lastRunAt ? formatDateTime(s.lastRunAt) : "never"}
                        {s.scheduleMinutes > 0 ? ` • every ${s.scheduleMinutes}m` : " • manual"}
                      </p>
                      {s.lastError ? <p className="mt-1 text-xs text-red-300">{s.lastError}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const MEMBER_COLORS = ["#14b8a6", "#818cf8", "#f59e0b", "#f472b6", "#38bdf8", "#a3e635"];

function buildChartData(salespeople: SalespersonRow[], days: number) {
  const members = salespeople.filter((sp) => sp.series.length > 0);
  const dayList: { iso: string; label: string; byMember: Record<string, number> }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86400_000);
    const iso = date.toISOString().slice(0, 10);
    dayList.push({
      iso,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      byMember: {},
    });
  }
  const index = new Map(dayList.map((d, i) => [d.iso, i]));
  let maxTotal = 0;
  for (const sp of members) {
    for (const row of sp.series) {
      if (row.toStatus !== "LIVE") continue;
      const slot = index.get(row.day);
      if (slot == null) continue;
      dayList[slot]!.byMember[sp.userId] = (dayList[slot]!.byMember[sp.userId] ?? 0) + row.count;
    }
  }
  for (const day of dayList) {
    const total = Object.values(day.byMember).reduce((a, b) => a + b, 0);
    maxTotal = Math.max(maxTotal, total);
  }
  return { days: dayList, members, maxTotal };
}
