"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ organization: { id: string; name: string } }>(
        "/api/v1/invitations/accept",
        { method: "POST", json: { token } },
      );
      router.push(`/o/${data.organization.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) {
        router.push(`/login?next=/invite/${token}`);
        return;
      }
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">Join your dealership on LotPilot</h1>
        <p className="mt-2 text-sm text-slate-500">
          Accept this invitation to join your team&apos;s workspace. You need to be signed in with
          the email the invite was sent to.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button className="btn-primary mt-5 w-full" onClick={accept} disabled={busy}>
          {busy ? "Joining…" : "Accept invitation"}
        </button>
        <p className="mt-3 text-sm text-slate-500">
          No account yet?{" "}
          <Link className="font-semibold text-brand-600 hover:underline" href="/register">
            Register first
          </Link>
          , then reopen this link.
        </p>
      </div>
    </main>
  );
}
