import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const org = await db.organization.findUniqueOrThrow({ where: { id: session.org.id } });
  const audits =
    session.membership.role === "OWNER" || session.membership.role === "ADMIN"
      ? await db.auditLog.findMany({
          where: { orgId: org.id },
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Organization</h2>
        <p>
          <strong>{org.name}</strong>
        </p>
        <p className="muted">
          Slug: {org.slug} · Timezone: {org.timezone}
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Policy: human-in-the-loop Marketplace assist only. OKauto never bypasses CAPTCHA, authentication, or
          platform rate limits.
        </p>
      </div>

      {audits.length ? (
        <div className="panel" style={{ marginTop: "1rem", overflowX: "auto" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Audit log</h2>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td>{a.createdAt.toLocaleString()}</td>
                  <td>{a.actor?.name ?? "System"}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.entityType}
                    {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
