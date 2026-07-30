"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";

interface TokenRow {
  id: string;
  name: string;
  owner: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function TokenManager({ orgId, tokens }: { orgId: string; tokens: TokenRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setNewToken(null);
    try {
      const data = await api<{ token: { value: string } }>(`/api/v1/orgs/${orgId}/tokens`, {
        method: "POST",
        json: { name: form.get("name") },
      });
      setNewToken(data.token.value);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not create the token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this token? The extension using it will be signed out.")) return;
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/tokens/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Revoke failed");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Extension API tokens"
        subtitle="Create a token and paste it into the LotPilot Chrome extension to sign in"
      />
      <div className="space-y-4 p-5">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="token-name">
              Token name
            </label>
            <input
              className="input"
              id="token-name"
              name="name"
              placeholder="My Chrome extension"
              required
            />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create token"}
          </button>
        </form>
        {newToken ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3" role="status">
            <p className="text-sm font-semibold text-emerald-800">
              Copy this token now — it will not be shown again:
            </p>
            <div className="mt-1 flex gap-2">
              <input
                className="input font-mono text-xs"
                readOnly
                value={newToken}
                aria-label="New API token"
              />
              <button
                className="btn-secondary"
                type="button"
                onClick={() => navigator.clipboard.writeText(newToken)}
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
        {tokens.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.owner} · created {timeAgo(t.createdAt)} ·{" "}
                    {t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <button className="btn-secondary" onClick={() => revoke(t.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No active tokens.</p>
        )}
      </div>
    </Card>
  );
}
