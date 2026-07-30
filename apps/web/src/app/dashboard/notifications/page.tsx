import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";
import { MarkReadButton } from "@/components/MarkReadButton";

export default async function NotificationsPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const items = await db.notification.findMany({
    where: { orgId: session.org.id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Alerts</h1>
          <p className="muted">Sold and price-change notifications for your listings.</p>
        </div>
        <MarkReadButton />
      </header>
      <div className="panel" style={{ marginTop: "1rem" }}>
        {items.length === 0 ? (
          <p className="muted">No notifications.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((n) => (
              <li
                key={n.id}
                style={{
                  padding: "0.85rem 0",
                  borderBottom: "1px solid var(--border)",
                  opacity: n.readAt ? 0.65 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>{n.title}</strong>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {n.createdAt.toLocaleString()}
                  </span>
                </div>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
