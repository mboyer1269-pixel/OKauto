"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/brand-mark";

export default function RegisterPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#d9f0ff_0%,#f6faff_42%,#edf3f9_100%)] px-4 py-8">
      <div className="card w-full max-w-md rounded-2xl p-7 sm:p-8">
        <div className="text-center mb-8">
          <BrandMark className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-black tracking-tight text-slate-950">
            Créez votre espace
          </h1>
          <p className="text-slate-600 mt-2">
            Invitez ensuite votre équipe de vente.
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
        <p className="text-center text-sm text-slate-600 mt-6">
          Vous avez déjà un compte?{" "}
          <Link href="/login" className="text-brand-600 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
