import { redirect } from "next/navigation";
import { db } from "@okauto/db";
import { requirePageAuth } from "@/lib/auth";
import { ExtensionTokenForm } from "@/components/ExtensionTokenForm";

export default async function ExtensionPage() {
  const session = await requirePageAuth();
  if (!session) redirect("/login");

  const tokens = await db.extensionToken.findMany({
    where: {
      userId: session.user.id,
      orgId: session.org.id,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Chrome extension</h1>
      <p className="muted">
        Load <code>apps/extension</code> unpacked in Chrome. Authenticate with an API token. OKauto only assists form
        fill — you publish. CAPTCHA and login challenges stay with you.
      </p>

      <ExtensionTokenForm />

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Active tokens</h2>
        {tokens.length === 0 ? (
          <p className="muted">No tokens yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Prefix</th>
                <th>Last used</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>
                    <code>{t.tokenPrefix}…</code>
                  </td>
                  <td>{t.lastUsedAt ? t.lastUsedAt.toLocaleString() : "—"}</td>
                  <td>{t.expiresAt ? t.expiresAt.toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Install steps</h2>
        <ol>
          <li>Build extension assets: <code>pnpm --filter @okauto/extension build</code></li>
          <li>Open <code>chrome://extensions</code> → Enable Developer mode</li>
          <li>Load unpacked → select <code>apps/extension</code></li>
          <li>Paste your API token in the popup and connect</li>
          <li>Open Facebook Marketplace vehicle create and click Assist fill</li>
        </ol>
      </div>
    </div>
  );
}
