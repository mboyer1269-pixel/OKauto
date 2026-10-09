"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    organizationName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Création du compte impossible",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="card w-full max-w-md rounded-2xl p-7 sm:p-8">
        <div className="mb-8 text-center">
          <ThemedBrandLockup className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-bold tracking-tight">
            Créez votre espace
          </h1>
          <p className="mt-2 text-muted-foreground">
            Invitez ensuite votre équipe de vente.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Votre nom
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label
              htmlFor="register-email"
              className="block text-sm font-medium mb-1"
            >
              Courriel
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium mb-1"
            >
              Mot de passe
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <div>
            <label
              htmlFor="organization"
              className="block text-sm font-medium mb-1"
            >
              Nom du concessionnaire
            </label>
            <input
              id="organization"
              name="organization"
              autoComplete="organization"
              className="input"
              value={form.organizationName}
              onChange={(e) =>
                setForm({ ...form, organizationName: e.target.value })
              }
              placeholder="Ex. Concession Automobile ABC"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? "Création…" : "Créer le compte"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Vous avez déjà un compte?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
