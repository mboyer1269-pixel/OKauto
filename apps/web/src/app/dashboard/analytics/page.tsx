import { requireDashboardSession } from '@/lib/session';
import { getOrgAnalytics } from '@/lib/services/analytics';
import { can } from '@okauto/shared';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await requireDashboardSession();
  const canViewAll = can(session.activeOrg.role, 'analytics:read:any');
  const analytics = await getOrgAnalytics(session.activeOrg.id);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Dealership performance and salesperson leaderboard</p>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <p className="label">Total listings</p>
          <div className="value">{analytics.listings.total}</div>
        </div>
        <div className="stat">
          <p className="label">Active</p>
          <div className="value">{analytics.listings.active}</div>
        </div>
        <div className="stat">
          <p className="label">Sold</p>
          <div className="value">{analytics.listings.sold}</div>
        </div>
        <div className="stat">
          <p className="label">Median time to list</p>
          <div className="value">
            {analytics.medianTimeToListMinutes === null ? '—' : `${analytics.medianTimeToListMinutes}m`}
          </div>
        </div>
      </div>

      {canViewAll ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Salesperson leaderboard</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Active</th>
                  <th>Needs attention</th>
                  <th>Sold</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {analytics.perSalesperson.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No listing activity yet.
                    </td>
                  </tr>
                )}
                {analytics.perSalesperson.map((s) => (
                  <tr key={s.userId}>
                    <td>{s.name}</td>
                    <td>{s.active}</td>
                    <td>{s.needsAttention}</td>
                    <td>{s.sold}</td>
                    <td>
                      <strong>{s.total}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="alert" style={{ marginTop: 16 }}>
          You can see your own performance. Ask a manager for the full leaderboard.
        </div>
      )}
    </div>
  );
}
