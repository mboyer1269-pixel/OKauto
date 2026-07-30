import Link from 'next/link';
import { prisma } from '@okauto/db';
import { formatPrice } from '@okauto/shared';
import { requireDashboardSession } from '@/lib/session';
import { getOrgAnalytics } from '@/lib/services/analytics';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const session = await requireDashboardSession();
  const orgId = session.activeOrg.id;
  const analytics = await getOrgAnalytics(orgId);

  const [recentListings, needsAttention] = await Promise.all([
    prisma.listing.findMany({
      where: { organizationId: orgId },
      include: { vehicle: { select: { title: true, priceCents: true } }, lister: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    prisma.listing.count({ where: { organizationId: orgId, status: 'NEEDS_ATTENTION' } }),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Welcome back, {session.user.name.split(' ')[0]}.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/dashboard/inventory">
            Manage inventory
          </Link>
          <Link className="btn btn-primary" href="/dashboard/listings">
            View listings
          </Link>
        </div>
      </div>

      {needsAttention > 0 && (
        <div className="alert alert-warn">
          {needsAttention} listing{needsAttention === 1 ? '' : 's'} need attention (sold or repriced).{' '}
          <Link href="/dashboard/listings?status=NEEDS_ATTENTION">Review now →</Link>
        </div>
      )}

      <div className="grid grid-4">
        <div className="stat">
          <p className="label">Inventory</p>
          <div className="value">{analytics.inventory.total}</div>
          <p className="small muted">{analytics.inventory.available} available · {analytics.inventory.sold} sold</p>
        </div>
        <div className="stat">
          <p className="label">Active listings</p>
          <div className="value">{analytics.listings.active}</div>
          <p className="small muted">{analytics.listings.total} total</p>
        </div>
        <div className="stat">
          <p className="label">Needs attention</p>
          <div className="value">{analytics.listings.needsAttention}</div>
          <p className="small muted">sold / price change</p>
        </div>
        <div className="stat">
          <p className="label">Median time to list</p>
          <div className="value">
            {analytics.medianTimeToListMinutes === null ? '—' : `${analytics.medianTimeToListMinutes}m`}
          </div>
          <p className="small muted">inventory → active</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Recent listing activity</h3>
          <Link className="small" href="/dashboard/listings">
            All listings →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Price</th>
                <th>Salesperson</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentListings.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No listings yet. Head to inventory to create your first listing.
                  </td>
                </tr>
              )}
              {recentListings.map((l) => (
                <tr key={l.id}>
                  <td>{l.vehicle.title || 'Untitled'}</td>
                  <td>{formatPrice(l.vehicle.priceCents) || '—'}</td>
                  <td>{l.lister.name}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="small muted">{new Date(l.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
