import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";
import { InviteForm } from "@/components/InviteForm";

export default async function TeamPage() {
  const session = await requirePageAuth("MANAGER");
  if (!session) redirect("/dashboard");

  const members = await db.membership.findMany({
    where: { orgId: session.org.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const invites = await db.invite.findMany({
    where: { orgId: session.org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
  });

  const canInvite =
    session.membership.role === "OWNER" || session.membership.role === "ADMIN";

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Team</h1>
      <p className="muted">RBAC memberships and pending invites.</p>

      {canInvite ? <InviteForm /> : null}

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Members</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>{m.role}</td>
                <td>{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Pending invites</h2>
        {invites.length === 0 ? (
          <p className="muted">No open invites.</p>
        ) : (
          <ul>
            {invites.map((i) => (
              <li key={i.id}>
                {i.email} · {i.role} · expires {i.expiresAt.toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
