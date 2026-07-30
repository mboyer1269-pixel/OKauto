import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";
import { VehicleActions } from "@/components/VehicleActions";

type Props = { params: Promise<{ id: string }> };

export default async function VehicleDetailPage({ params }: Props) {
  const session = await requirePageAuth();
  if (!session) redirect("/login");
  const { id } = await params;

  const vehicle = await db.vehicle.findFirst({
    where: { id, orgId: session.org.id },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      listings: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!vehicle) notFound();

  return (
    <div>
      <p>
        <Link href="/dashboard/inventory">← Inventory</Link>
      </p>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>
          {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim ?? ""}
        </h1>
        <p className="muted">
          Stock {vehicle.stockNumber}
          {vehicle.vin ? ` · VIN ${vehicle.vin}` : ""} · ${(vehicle.priceCents / 100).toLocaleString()}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Specs</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "0.4rem 0.75rem", margin: 0 }}>
            <dt className="muted">Mileage</dt>
            <dd style={{ margin: 0 }}>{vehicle.mileage?.toLocaleString() ?? "—"}</dd>
            <dt className="muted">Body</dt>
            <dd style={{ margin: 0 }}>{vehicle.bodyStyle ?? "—"}</dd>
            <dt className="muted">Color</dt>
            <dd style={{ margin: 0 }}>{vehicle.exteriorColor ?? "—"}</dd>
            <dt className="muted">Drivetrain</dt>
            <dd style={{ margin: 0 }}>{vehicle.drivetrain ?? "—"}</dd>
            <dt className="muted">Status</dt>
            <dd style={{ margin: 0 }}>{vehicle.status}</dd>
          </dl>
          {vehicle.description ? (
            <p style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>{vehicle.description}</p>
          ) : null}
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Photos</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.5rem" }}>
            {vehicle.media.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt=""
                style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        </section>

        <VehicleActions vehicleId={vehicle.id} canList={vehicle.status === "AVAILABLE"} />
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Listing history</h2>
        {vehicle.listings.length === 0 ? (
          <p className="muted">No listings yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>By</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {vehicle.listings.map((l) => (
                <tr key={l.id}>
                  <td>{l.status}</td>
                  <td>{l.user.name}</td>
                  <td>{l.updatedAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
