"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { api, setStoredSession } from "@/lib/api";

function AcceptInviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; name: string };
        organizationId: string;
      }>("/v1/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      setStoredSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
        organizationId: res.organizationId,
        organizationName: "Your dealership",
        role: "salesperson",
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite accept failed");
    }
  }

  return (
    <main className="shell" style={{ padding: "3rem 0", maxWidth: 480 }}>
      <Link href="/" className="display" style={{ fontSize: "2rem" }}>
        OKauto
      </Link>
      <h1>Accept invite</h1>
      <form className="panel" onSubmit={onSubmit} style={{ padding: "1.25rem", display: "grid", gap: "0.85rem" }}>
        <label className="field">
          <span>Invite token</span>
          <input value={token} readOnly />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        <button className="btn btn-primary" type="submit">
          Join dealership
        </button>
      </form>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main className="shell" style={{ padding: "3rem 0" }}>Loading…</main>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
