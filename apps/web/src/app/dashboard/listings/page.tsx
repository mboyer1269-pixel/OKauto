import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";

export default async function ListingsPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const listings = await db.listing.findMany({
    where: { orgId: session.org.id },
    include: {
      vehicle: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Listings</h1>
      <p className="muted">Marketplace assist history across your team.</p>
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Salesperson</th>
              <th>Status</th>
              <th>Price</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.vehicle.year} {l.vehicle.make} {l.vehicle.model}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {l.vehicle.stockNumber}
                  </div>
                </td>
                <td>{l.user.name}</td>
                <td>
                  <span
                    className={
                      l.status === "NEEDS_REMOVAL"
                        ? "badge badge-danger"
                        : l.status === "PUBLISHED"
                          ? "badge"
                          : "badge badge-neutral"
                    }
                  >
                    {l.status}
                  </span>
                </td>
                <td>${(l.priceCents / 100).toLocaleString()}</td>
                <td>{l.updatedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
