import { prisma } from '@okauto/db';
import { requireDashboardSession } from '@/lib/session';
import { can } from '@okauto/shared';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const session = await requireDashboardSession();
  if (!can(session.activeOrg.role, 'audit:read')) {
    return (
      <div className="alert">You do not have permission to view the audit log for this organization.</div>
    );
  }

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: session.activeOrg.id },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <p className="muted">Audit trail of actions in this organization</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No activity yet.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="small muted">{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.actor?.name ?? 'System'}</td>
                  <td>
                    <code>{log.action}</code>
                  </td>
                  <td className="small muted">
                    {log.targetType ? `${log.targetType}:${log.targetId ?? ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
