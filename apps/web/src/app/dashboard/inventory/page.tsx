import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";
import { ImportForm } from "@/components/ImportForm";

export default async function InventoryPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const vehicles = await db.vehicle.findMany({
    where: { orgId: session.org.id },
    include: {
      media: { take: 1, orderBy: { sortOrder: "asc" } },
      listings: {
        where: { status: { in: ["PUBLISHED", "ASSISTING", "NEEDS_REMOVAL", "PRICE_STALE", "READY"] } },
        select: { id: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Inventory</h1>
          <p className="muted">Normalized lot units with duplicate prevention and sync status.</p>
        </div>
      </header>

      <ImportForm />

      <div className="panel" style={{ marginTop: "1rem", overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Stock</th>
              <th>Vehicle</th>
              <th>Price</th>
              <th>Status</th>
              <th>Listing</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>{v.stockNumber}</td>
                <td>
                  {v.year} {v.make} {v.model} {v.trim ?? ""}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {v.mileage != null ? `${v.mileage.toLocaleString()} mi` : "—"}
                    {v.vin ? ` · ${v.vin}` : ""}
                  </div>
                </td>
                <td>${(v.priceCents / 100).toLocaleString()}</td>
                <td>
                  <span
                    className={
                      v.status === "SOLD"
                        ? "badge badge-danger"
                        : v.status === "AVAILABLE"
                          ? "badge"
                          : "badge badge-neutral"
                    }
                  >
                    {v.status}
                  </span>
                </td>
                <td>
                  {v.listings[0] ? (
                    <span
                      className={
                        v.listings[0].status === "NEEDS_REMOVAL"
                          ? "badge badge-danger"
                          : "badge badge-neutral"
                      }
                    >
                      {v.listings[0].status}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <Link href={`/dashboard/inventory/${v.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
