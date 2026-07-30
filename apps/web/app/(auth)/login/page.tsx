"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 text-base font-bold">Sign in</h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@dealership.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-400">
        New dealership?{" "}
        <Link href="/register" className="font-semibold text-brand-400 hover:text-brand-300">
          Create your organization
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-600">
        Demo: owner@demo.dev / demo-password-123
      </p>
    </Card>
  );
}
