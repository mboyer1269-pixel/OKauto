import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const orgId = session.org.id;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    available,
    published,
    needsRemoval,
    listingsLast30,
    byUser,
    sources,
    notifications,
  ] = await Promise.all([
    db.vehicle.count({ where: { orgId, status: "AVAILABLE" } }),
    db.listing.count({ where: { orgId, status: "PUBLISHED" } }),
    db.listing.count({ where: { orgId, status: "NEEDS_REMOVAL" } }),
    db.listing.count({ where: { orgId, createdAt: { gte: since } } }),
    db.listing.groupBy({
      by: ["userId"],
      where: { orgId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.inventorySource.findMany({ where: { orgId } }),
    db.notification.findMany({
      where: { orgId, userId: session.user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const users = await db.user.findMany({
    where: { id: { in: byUser.map((u) => u.userId) } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Overview</h1>
        <p className="muted">Real-time inventory and Marketplace listing health.</p>
      </header>

      <section className="grid-kpi" aria-label="Key metrics">
        <article className="panel">
          <div className="muted">Available inventory</div>
          <p className="kpi-value">{available}</p>
        </article>
        <article className="panel">
          <div className="muted">Published listings</div>
          <p className="kpi-value">{published}</p>
        </article>
        <article className="panel">
          <div className="muted">Needs removal</div>
          <p className="kpi-value">{needsRemoval}</p>
        </article>
        <article className="panel">
          <div className="muted">Listings (30d)</div>
          <p className="kpi-value">{listingsLast30}</p>
        </article>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          marginTop: "1.25rem",
        }}
      >
        <section className="panel" aria-labelledby="activity-heading">
          <h2 id="activity-heading" style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Salesperson activity (30d)
          </h2>
          {byUser.length === 0 ? (
            <p className="muted">No listings yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Listings</th>
                </tr>
              </thead>
              <tbody>
                {byUser.map((row) => (
                  <tr key={row.userId}>
                    <td>{userMap.get(row.userId) ?? row.userId}</td>
                    <td>{row._count._all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" aria-labelledby="sync-heading">
          <h2 id="sync-heading" style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Sync health
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sources.map((s) => (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.55rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>
                  {s.name}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {s.type}
                  </div>
                </span>
                <span
                  className={
                    s.health === "HEALTHY"
                      ? "badge"
                      : s.health === "FAILING"
                        ? "badge badge-danger"
                        : "badge badge-warn"
                  }
                >
                  {s.health}
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "1rem" }}>
            <Link className="btn btn-secondary" href="/dashboard/inventory">
              Manage inventory
            </Link>
          </div>
        </section>

        <section className="panel" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Your alerts
          </h2>
          {notifications.length === 0 ? (
            <p className="muted">You&apos;re caught up.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {notifications.map((n) => (
                <li key={n.id} style={{ padding: "0.55rem 0", borderBottom: "1px solid var(--border)" }}>
                  <strong>{n.title}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {n.body}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "1rem" }}>
            <Link className="btn btn-secondary" href="/dashboard/notifications">
              View all alerts
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
