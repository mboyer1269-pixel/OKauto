"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { formatDateTime } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  user: { name: string };
}

export default function ApiKeysPage() {
  return (
    <ProtectedRoute>
      <ApiKeysContent />
    </ProtectedRoute>
  );
}

function ApiKeysContent() {
  const { apiFetch } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await apiFetch("/api/v1/admin/api-keys");
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data))
        throw new Error("Les clés d’extension n’ont pas pu être chargées.");
      setKeys(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/v1/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName.trim() || "Extension Chrome" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.key)
        throw new Error(data.error ?? "La clé n’a pas pu être créée.");
      setCreatedKey(data.key);
      setNewKeyName("");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "La clé n’a pas pu être créée.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyCreatedKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Chrome a bloqué la copie. Sélectionnez la clé manuellement.");
    }
  };

  const handleRevoke = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/v1/admin/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("La clé n’a pas pu être révoquée.");
      setRevokeId(null);
      await load();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "La clé n’a pas pu être révoquée.",
      );
    } finally {
      setSaving(false);
    }
  };

  const activeCount = keys.filter((key) => key.isActive).length;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-signal" />
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-sidebar-accent">
              <KeyRound size={17} />
              <p className="brand-label text-[11px] font-bold uppercase tracking-[0.18em]">
                Accès extension Chrome
              </p>
            </div>
            <h1 className="brand-display mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              Connecter mon poste de vente
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Une clé par ordinateur. Elle permet à l’extension de lire votre
              inventaire et d’enregistrer les annonces publiées.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/[0.06] px-4 py-3">
            <ShieldCheck className="text-emerald-400" size={22} />
            <div>
              <p className="text-2xl font-black tabular-nums">{activeCount}</p>
              <p className="text-xs text-slate-400">
                poste{activeCount === 1 ? "" : "s"} actif
                {activeCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="flex items-center gap-2">
            <AlertCircle size={17} />
            {error}
          </span>
          <button
            type="button"
            onClick={() => setError("")}
            className="rounded p-1 hover:bg-red-100"
            aria-label="Fermer le message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {createdKey && (
        <section
          className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5"
          aria-labelledby="created-key-title"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="created-key-title"
                className="font-black text-emerald-950"
              >
                Clé prête à installer
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Copiez-la maintenant : elle ne sera plus affichée après avoir
                fermé ce bloc.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="rounded-lg p-2 text-emerald-800 hover:bg-emerald-100"
              aria-label="Fermer la nouvelle clé"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-signal/30 bg-card p-3 text-xs text-foreground">
              {createdKey}
            </code>
            <button
              type="button"
              onClick={copyCreatedKey}
              className="btn-primary min-h-11 sm:self-start"
            >
              {copied ? (
                <Check size={16} className="mr-2" />
              ) : (
                <Copy size={16} className="mr-2" />
              )}
              {copied ? "Copiée" : "Copier la clé"}
            </button>
          </div>
        </section>
      )}

      <section
        className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
        aria-labelledby="new-key-title"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label>
            <span
              id="new-key-title"
              className="block text-sm font-black text-slate-950"
            >
              Nom du nouvel ordinateur
            </span>
            <span className="mb-2 mt-1 block text-xs text-muted-foreground">
              Exemple : Chrome — bureau de Michael
            </span>
            <input
              className="input min-h-11"
              placeholder="Extension Chrome"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !saving) void handleCreate();
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleCreate}
            className="btn-primary min-h-11"
            disabled={saving}
          >
            {saving ? (
              <RefreshCw size={16} className="mr-2 animate-spin" />
            ) : (
              <KeyRound size={16} className="mr-2" />
            )}
            {saving ? "Création…" : "Créer la clé"}
          </button>
        </div>
      </section>

      <section aria-labelledby="key-list-title">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2
              id="key-list-title"
              className="text-lg font-black text-foreground"
            >
              Mes postes autorisés
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Révoquez une clé si un ordinateur change de propriétaire.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-secondary px-3"
            aria-label="Actualiser les clés"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {loading ? (
          <div className="grid gap-3" aria-label="Chargement des clés">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-2xl bg-slate-200"
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            Aucun poste autorisé pour le moment.
          </div>
        ) : (
          <div className="grid gap-3">
            {keys.map((key) => (
              <article
                key={key.id}
                className="content-auto grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-black text-foreground">
                      {key.name}
                    </h3>
                    <span
                      className={
                        key.isActive ? "badge-success" : "badge-neutral"
                      }
                    >
                      {key.isActive ? "Active" : "Révoquée"}
                    </span>
                  </div>
                  <p className="brand-label mt-2 text-xs font-bold text-primary">
                    {key.keyPrefix}…
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Créée par {key.user.name} · {formatDateTime(key.createdAt)}{" "}
                    · Dernière utilisation :{" "}
                    {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "jamais"}
                  </p>
                </div>
                {key.isActive &&
                  (revokeId === key.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 p-2">
                      <span className="px-1 text-xs font-bold text-red-800">
                        Confirmer?
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRevoke(key.id)}
                        className="btn-danger px-3 py-1.5"
                        disabled={saving}
                      >
                        Révoquer
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeId(null)}
                        className="btn-secondary px-3 py-1.5"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRevokeId(key.id)}
                      className="btn-secondary min-h-11 text-red-700 hover:bg-red-50"
                      aria-label={`Révoquer la clé ${key.name}`}
                    >
                      <Trash2 size={16} className="mr-2" /> Révoquer
                    </button>
                  ))}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
