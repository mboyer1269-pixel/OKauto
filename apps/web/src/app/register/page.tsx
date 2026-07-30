"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setStoredSession } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organizationName: "",
  });
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
        organization: { id: string; name: string };
      }>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setStoredSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
        organizationId: res.organization.id,
        organizationName: res.organization.name,
        role: "owner",
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell" style={{ padding: "3rem 0", maxWidth: 520 }}>
      <Link href="/" className="display" style={{ fontSize: "2rem" }}>
        OKauto
      </Link>
      <h1 style={{ marginTop: "1.5rem" }}>Create your dealership</h1>
      <form onSubmit={onSubmit} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "0.9rem" }}>
        {(
          [
            ["name", "Your name", "text"],
            ["email", "Work email", "email"],
            ["password", "Password (8+ chars)", "password"],
            ["organizationName", "Dealership name", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <label key={key} className="field">
            <span>{label}</span>
            <input
              type={type}
              required
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        {error ? <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <p>
        Already have access? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
