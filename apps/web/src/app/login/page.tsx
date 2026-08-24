"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/brand-mark";

export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#d9f0ff_0%,#f6faff_42%,#edf3f9_100%)] px-4">
      <div className="card w-full max-w-md rounded-2xl p-7 sm:p-8">
        <div className="text-center mb-8">
          <BrandMark className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-black tracking-tight text-slate-950">
            Bon retour
          </h1>
          <p className="text-slate-600 mt-2">
            Connectez-vous à votre espace concessionnaire.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 text-red-700 rounded-lg text-sm"
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
        <p className="text-center text-sm text-slate-600 mt-6">
          Nouveau sur Suivia Auto?{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-600 hover:underline"
          >
            Créer un espace
          </Link>
        </p>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-6 p-3 bg-slate-50 rounded-lg text-xs text-slate-500">
            <p className="font-medium mb-1">Accès de démonstration locale :</p>
            <p>owner@demo.okauto.local / Demo1234!</p>
          </div>
        )}
      </div>
    </div>
  );
}
