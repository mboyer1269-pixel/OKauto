"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? "Could not sign in.");
      setPending(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="login-card" onSubmit={(event) => void submit(event)}>
      <div className="brand-mark" aria-hidden="true">D</div>
      <p className="eyebrow">Dealership workspace</p>
      <h1>Welcome to DriveFlow</h1>
      <p className="muted">Inventory stays synchronized. Publishing stays in your hands.</p>
      <label>
        Work email
        <input name="email" type="email" autoComplete="email" defaultValue="owner@demo.driveflow.local" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" defaultValue="DemoDrive!2026" minLength={8} required />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button primary wide" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spin" size={18} /> : <>Sign in <ArrowRight size={18} /></>}
      </button>
      <p className="security-note"><ShieldCheck size={16} /> Secure, dealership-scoped access</p>
    </form>
  );
}
