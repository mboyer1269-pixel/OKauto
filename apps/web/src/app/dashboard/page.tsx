import { requireSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { buildPhotoChecklist } from "@okauto/shared";

function formatCurrency(value: number | undefined) {
  return value === undefined ? "Contact" : `$${value.toLocaleString()}`;
}

function statusClass(status: string | undefined) {
  return `badge badge-${(status ?? "draft").toLowerCase()}`;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const dashboard = await getDashboardData(session);
  const primaryVehicle = dashboard.inventory[0];

  return (
    <div className="grid">
      <section className="grid metrics" aria-label="Listing metrics">
        {dashboard.metrics.map((metric) => (
          <article className="card" key={metric.label}>
            <p className="muted">{metric.label}</p>
            <div className={`metric-value tone-${metric.tone}`}>{metric.value}</div>
            {metric.delta ? <p className="muted">{metric.delta}</p> : null}
          </article>
        ))}
      </section>

      <section className="grid dashboard-grid">
        <article className="card" id="inventory">
          <div className="topbar" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Inventory lifecycle</p>
              <h2>Vehicles needing listing action</h2>
            </div>
            <a className="button secondary-button" href="/api/v1/dashboard">
              API JSON
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Salesperson</th>
                  <th>Photos</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.inventory.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <strong>
                        {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim}
                      </strong>
                      <div className="muted">
                        {vehicle.vin ?? vehicle.stockNumber ?? "No VIN"} ·{" "}
                        {vehicle.mileage?.toLocaleString() ?? "Unknown"} mi
                      </div>
                    </td>
                    <td>{formatCurrency(vehicle.price)}</td>
                    <td>
                      <span className={statusClass(vehicle.listingStatus ?? vehicle.status)}>
                        {(vehicle.listingStatus ?? vehicle.status).replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>{vehicle.salesperson ?? "Unassigned"}</td>
                    <td>
                      {vehicle.photoCount}
                      {vehicle.photoCount < 8 ? (
                        <div className="muted">Needs {buildPhotoChecklist(vehicle.photoCount).length} shots</div>
                      ) : null}
                    </td>
                    <td>{new Date(vehicle.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="stack">
          <article className="card" id="alerts">
            <p className="eyebrow">Recovery queue</p>
            <h2>Alerts</h2>
            <div className="stack">
              {dashboard.notifications.map((notification) => (
                <div className="activity-item" key={notification.id}>
                  <span className={`badge badge-${notification.severity}`}>{notification.type.replaceAll("_", " ")}</span>
                  <h3>{notification.title}</h3>
                  <p className="muted">{notification.message}</p>
                </div>
              ))}
              {dashboard.notifications.length === 0 ? <p className="muted">No active alerts.</p> : null}
            </div>
          </article>

          <article className="card" id="sync-health">
            <p className="eyebrow">Data pipeline</p>
            <h2>Sync health</h2>
            <div className="stack">
              {dashboard.syncHealth.map((sync) => (
                <div className="activity-item" key={`${sync.source}-${sync.lastRunAt}`}>
                  <span className={`badge badge-${sync.status === "failed" ? "critical" : sync.status}`}>
                    {sync.status}
                  </span>
                  <h3>{sync.source}</h3>
                  <p className="muted">{sync.message}</p>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="grid dashboard-grid">
        <article className="card">
          <p className="eyebrow">Marketplace assistant</p>
          <h2>Draft preview</h2>
          {primaryVehicle ? (
            <>
              <p>
                <strong>
                  {primaryVehicle.year} {primaryVehicle.make} {primaryVehicle.model} {primaryVehicle.trim}
                </strong>
              </p>
              <p className="muted">
                Extension captures and dealer imports create drafts here for review, copy, and human-confirmed
                Marketplace posting.
              </p>
              <a className="button" href="/api/v1/listings/generate">
                Generate via API
              </a>
            </>
          ) : (
            <p className="muted">Import or capture inventory to start listing assistance.</p>
          )}
        </article>

        <article className="card">
          <p className="eyebrow">Activity</p>
          <h2>Recent team events</h2>
          <div className="stack">
            {dashboard.activity.map((event) => (
              <div className="activity-item" key={event.id}>
                <strong>{event.actor}</strong> {event.action}
                <div className="muted">
                  {event.target} · {new Date(event.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
