"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setStoredSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@demo.okauto.local");
  const [password, setPassword] = useState("DemoPass123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; name: string };
        memberships: Array<{
          role: string;
          organization: { id: string; name: string };
        }>;
      }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const membership = res.memberships[0];
      if (!membership) throw new Error("No organization membership");
      setStoredSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        role: membership.role,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell" style={{ padding: "3rem 0", maxWidth: 480 }}>
      <Link href="/" className="display" style={{ fontSize: "2rem" }}>
        OKauto
      </Link>
      <h1 style={{ marginTop: "1.5rem" }}>Sign in</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Demo: owner@demo.okauto.local / DemoPass123!
      </p>
      <form onSubmit={onSubmit} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "0.9rem" }}>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" />
        </label>
        <label className="field">
          <span>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" />
        </label>
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        New dealership? <Link href="/register">Create an account</Link>
      </p>
    </main>
  );
}
