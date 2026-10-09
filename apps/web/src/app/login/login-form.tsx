"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";

export function LoginForm({
  publicSignupEnabled,
}: {
  publicSignupEnabled: boolean;
}) {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card w-full max-w-md rounded-2xl p-7 sm:p-8">
        <div className="mb-8 text-center">
          <ThemedBrandLockup className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-bold tracking-tight">
            Bon retour
          </h1>
          <p className="mt-2 text-muted-foreground">
            Connectez-vous à votre espace concessionnaire.
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
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Courriel
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        {publicSignupEnabled ? (
          <p className="text-center text-sm text-muted-foreground mt-6">
            Nouveau sur Suivia?{" "}
            <Link
              href="/register"
              className="font-semibold text-primary hover:underline"
            >
              Créer un espace
            </Link>
          </p>
        ) : (
          <p className="text-center text-sm text-muted-foreground mt-6">
            L’accès se fait sur invitation d’un administrateur de votre
            concession.
          </p>
        )}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Accès de démonstration locale :</p>
            <p>owner@demo.okauto.local / Demo1234!</p>
          </div>
        )}
      </div>
    </div>
  );
}
