"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Button, EmptyState, ErrorNote, PageHeader, Spinner, TableShell, Td, Th, inputClass } from "@/components/ui";

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export default function AuditPage() {
  const { currentOrg } = useSession();
  const orgId = currentOrg?.orgId;
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);

  const path = useMemo(() => {
    if (!orgId) return null;
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (entityType) params.set("entityType", entityType);
    return `/api/v1/orgs/${orgId}/audit-logs?${params}`;
  }, [orgId, entityType, page]);

  const { data, error, loading } = useApi<{ items: AuditItem[]; total: number; pageSize: number }>(path);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every consequential action across your dealership, for compliance and debugging." />
      <div className="mb-3">
        <select
          className={`${inputClass} w-auto`}
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by entity"
        >
          <option value="">All entities</option>
          {["vehicle", "listing", "organization", "membership", "invite", "feed_source", "sync_run", "user"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote message={error} />
      {loading && <Spinner />}
      {data && data.items.length === 0 && <EmptyState title="No audit entries match" />}
      {data && data.items.length > 0 && (
        <TableShell>
          <thead className="bg-slate-50">
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <Td className="text-xs">{formatDate(item.createdAt)}</Td>
                <Td>{item.actor ? item.actor.name : <span className="text-slate-400">system</span>}</Td>
                <Td>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{item.action}</code>
                </Td>
                <Td className="text-xs text-slate-500">{item.entityType}</Td>
                <Td className="max-w-[300px] truncate text-xs text-slate-400" >
                  {Object.keys(item.meta).length > 0 ? JSON.stringify(item.meta) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {data && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
