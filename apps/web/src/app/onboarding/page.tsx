"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiClientError, type SessionOrg } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshOrgs, selectOrg } = useSession();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteToken, setInviteToken] = useState("");

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ org: { id: string; name: string; slug: string } }>("/api/v1/orgs", {
        method: "POST",
        body: { name, city: city || undefined, region: region || undefined, phone: phone || undefined },
      });
      const me = await api<{ orgs: SessionOrg[] }>("/api/v1/auth/me");
      refreshOrgs(me.orgs);
      selectOrg(res.org.id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create dealership");
    } finally {
      setBusy(false);
    }
  }

  async function joinOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ orgs: SessionOrg[] }>("/api/v1/auth/invites/accept", {
        method: "POST",
        body: { token: inviteToken.trim() },
      });
      refreshOrgs(res.orgs);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Invite could not be accepted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">Set up your workspace</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Create a new dealership, or join an existing one with an invite token.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
            >
              {m === "create" ? "Create dealership" : "Join with invite"}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <form onSubmit={createOrg} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <ErrorNote message={error} />
            <Field label="Dealership name">
              <input className={inputClass} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="State / region">
                <input className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)} />
              </Field>
            </div>
            <Field label="Phone">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create dealership"}
            </Button>
          </form>
        ) : (
          <form onSubmit={joinOrg} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <ErrorNote message={error} />
            <Field label="Invite token" hint="Ask a manager to invite you from Team settings, then paste the token here.">
              <input className={inputClass} required value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Joining…" : "Join dealership"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
