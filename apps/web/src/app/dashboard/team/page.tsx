"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Building2,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { getTeamAccessLabel, getTeamMemberTitle } from "@/lib/team-members";

interface Member {
  id: string;
  role: string;
  passwordResetAllowed?: boolean;
  user: { id: string; name: string; email: string; isActive: boolean };
}

interface CreatedMember {
  name: string;
  email: string;
  temporaryPassword: string | null;
  inviteUrl: string | null;
  notice?: string;
  action: "invited" | "reset";
}

const EMPTY_INVITE = { name: "", email: "", role: "SALESPERSON" };

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  const randomPart = Array.from(
    values,
    (value) => alphabet[value % alphabet.length],
  ).join("");
  return `Ok!${randomPart}7a`;
}

export default function TeamPage() {
  return (
    <ProtectedRoute>
      <TeamContent />
    </ProtectedRoute>
  );
}

function TeamContent() {
  const { apiFetch, organization, role } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [createdMember, setCreatedMember] = useState<CreatedMember | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [resettingMember, setResettingMember] = useState<Member | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const loadMembers = useCallback(async () => {
    setPageError("");
    try {
      const response = await apiFetch("/api/v1/organizations/members");
      if (!response.ok)
        throw new Error("Impossible de charger les membres de l’équipe.");
      setMembers((await response.json()) as Member[]);
    } catch (loadError) {
      setPageError(
        loadError instanceof Error
          ? loadError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const openInviteForm = () => {
    setResettingMember(null);
    setCreatedMember(null);
    setFormError("");
    setInvite({ ...EMPTY_INVITE });
    setShowInvite(true);
  };

  const closeInviteForm = () => {
    setShowInvite(false);
    setFormError("");
    setInvite(EMPTY_INVITE);
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    const submittedInvite = {
      ...invite,
      name: invite.name.trim(),
      email: invite.email.trim().toLocaleLowerCase("fr-CA"),
    };

    try {
      const response = await apiFetch("/api/v1/organizations/members", {
        method: "POST",
        body: JSON.stringify(submittedInvite),
      });
      const result = (await response.json()) as {
        error?: string;
        inviteUrl?: string;
        notice?: string;
      };

      if (!response.ok || !result.inviteUrl) {
        throw new Error(result.error ?? "L’invitation n’a pas pu être créée.");
      }

      setCreatedMember({
        name: submittedInvite.name,
        email: submittedInvite.email,
        action: "invited",
        temporaryPassword: null,
        inviteUrl: result.inviteUrl,
        notice: result.notice,
      });
      setShowInvite(false);
      setInvite(EMPTY_INVITE);
      await loadMembers();
    } catch (inviteError) {
      setFormError(
        inviteError instanceof Error
          ? inviteError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openPasswordReset = (member: Member) => {
    setShowInvite(false);
    setPageError("");
    setCreatedMember(null);
    setResetPassword(generateTemporaryPassword());
    setResettingMember(member);
  };

  const handlePasswordReset = async () => {
    if (!resettingMember || resetPassword.length < 8) return;
    setSaving(true);
    setPageError("");
    try {
      const response = await apiFetch(
        `/api/v1/organizations/members/${resettingMember.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ password: resetPassword }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        passwordUpdated?: boolean;
      };
      if (!response.ok || !result.passwordUpdated) {
        throw new Error(
          result.error ?? "Le nouvel accès n’a pas pu être créé.",
        );
      }
      setCreatedMember({
        name: resettingMember.user.name,
        email: resettingMember.user.email,
        temporaryPassword: resetPassword,
        inviteUrl: null,
        action: "reset",
      });
      setResettingMember(null);
      setResetPassword("");
      await loadMembers();
    } catch (resetError) {
      setPageError(
        resetError instanceof Error
          ? resetError.message
          : "Le nouvel accès n’a pas pu être créé.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdMember) return;
    const details = createdMember.inviteUrl
      ? `Invitation Suivia Auto\nCourriel : ${createdMember.email}\nLien (à copier maintenant) : ${createdMember.inviteUrl}`
      : createdMember.temporaryPassword
        ? `Accès Suivia Auto\nCourriel : ${createdMember.email}\nMot de passe temporaire : ${createdMember.temporaryPassword}`
        : `Accès Suivia Auto\nCourriel : ${createdMember.email}`;

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setPageError(
        "La copie automatique a échoué. Les accès restent visibles ci-dessus.",
      );
    }
  };

  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Accès et responsabilités
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Équipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} membre{members.length === 1 ? "" : "s"}{" "}
            {members.length === 1 ? "peut" : "peuvent"} accéder à Suivia Auto.
          </p>
        </div>
        {canManage && !showInvite && (
          <button
            type="button"
            onClick={openInviteForm}
            className="btn-primary"
          >
            <Plus className="mr-2" size={17} /> Ajouter un membre
          </button>
        )}
      </div>

      {createdMember && (
        <section
          className="rounded-2xl border border-signal/30 bg-signal/10 p-5"
          aria-live="polite"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-signal"
                size={22}
              />
              <div>
                <h2 className="font-bold text-foreground">
                  {createdMember.action === "reset"
                    ? `Nouvel accès prêt pour ${createdMember.name}`
                    : `Invitation prête pour ${createdMember.name}`}
                </h2>
                <p className="mt-1 text-sm text-signal">
                  {createdMember.action === "reset"
                    ? "Toutes les anciennes sessions ont été fermées. Copiez ce nouveau mot de passe temporaire et transmettez-le de façon sécuritaire."
                    : createdMember.notice ??
                      "Aucun courriel n’est envoyé. Copiez ce lien maintenant — il ne sera plus réaffiché."}
                </p>
                <div className="mt-3 rounded-xl border border-signal/30 bg-card/80 px-4 py-3 font-mono text-sm text-foreground">
                  <p>{createdMember.email}</p>
                  {createdMember.inviteUrl && (
                    <p className="mt-1 break-all">{createdMember.inviteUrl}</p>
                  )}
                  {createdMember.temporaryPassword && (
                    <p className="mt-1">{createdMember.temporaryPassword}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void copyCredentials()}
              >
                <Copy className="mr-2" size={16} />{" "}
                {copied
                  ? "Copié"
                  : createdMember.inviteUrl
                    ? "Copier le lien"
                    : "Copier les accès"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={openInviteForm}
              >
                <Plus className="mr-2" size={16} /> Ajouter une autre personne
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-l-4 border-primary px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Building2 size={21} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Inventaire partagé
              </p>
              <h2 className="mt-1 font-bold text-foreground">
                Une équipe, un seul inventaire Buckingham
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Chaque personne invitée ici rejoint{" "}
                {organization?.name ?? "la concession"} seulement après avoir
                accepté le lien. Elle voit alors tout l’inventaire synchronisé,
                avec son propre nom sur ses descriptions et ses publications.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-xl bg-slate-950 px-4 py-3 text-sm text-white">
            <p className="font-semibold">Accès automatique</p>
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">
              Inventaire · Publications · Photos
            </p>
          </div>
        </div>
      </section>

      {showInvite && (
        <form onSubmit={handleInvite} className="card max-w-2xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-2 text-primary">
              <Users size={20} />
            </div>
            <div>
              <h2 className="font-bold text-foreground">
                Inviter un membre
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Un lien d’invitation à usage unique sera affiché une seule
                fois. Aucun courriel n’est envoyé : copiez-le et transmettez-le
                vous-même. Le destinataire choisit son mot de passe. Le lien
                expire dans 7 jours.
              </p>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-foreground">
              Nom complet
              <input
                className="input mt-1.5"
                placeholder="Ex. Marie Tremblay"
                value={invite.name}
                onChange={(event) =>
                  setInvite({ ...invite, name: event.target.value })
                }
                autoComplete="name"
                required
              />
            </label>
            <label className="text-sm font-semibold text-foreground">
              Courriel professionnel
              <input
                className="input mt-1.5"
                type="email"
                placeholder="marie@concession.ca"
                value={invite.email}
                onChange={(event) =>
                  setInvite({ ...invite, email: event.target.value })
                }
                autoComplete="email"
                required
              />
            </label>
            <label className="text-sm font-semibold text-foreground sm:col-span-2">
              Fonction et niveau d’accès
              <select
                className="input mt-1.5"
                value={invite.role}
                onChange={(event) =>
                  setInvite({ ...invite, role: event.target.value })
                }
              >
                <option value="SALESPERSON">
                  Représentant aux ventes — inventaire et publications
                </option>
                <option value="MANAGER">
                  Direction des ventes — gestion opérationnelle
                </option>
                <option value="ADMIN">
                  Administration — gestion complète, incluant l’équipe
                </option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeInviteForm}
              disabled={saving}
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Invitation en cours…" : "Créer l’invitation"}
            </button>
          </div>
        </form>
      )}

      {pageError && (
        <div className="card flex items-center justify-between gap-4 border-destructive/30 bg-destructive/10 text-sm text-destructive">
          <span>{pageError}</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void loadMembers()}
          >
            Réessayer
          </button>
        </div>
      )}

      {resettingMember && (
        <section
          className="rounded-2xl border-2 border-primary/30 bg-primary/10 p-5"
          aria-labelledby="reset-access-title"
        >
          <h2 id="reset-access-title" className="font-bold text-foreground">
            Réinitialiser l’accès de {resettingMember.user.name}
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Ce nouveau mot de passe remplacera l’ancien et fermera ses sessions
            existantes.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Nouveau mot de passe temporaire</span>
              <input
                className="input min-h-11 font-mono"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                minLength={8}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResetPassword(generateTemporaryPassword())}
              disabled={saving}
            >
              <RefreshCw className="mr-2" size={16} /> Régénérer
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handlePasswordReset()}
              disabled={saving || resetPassword.length < 8}
            >
              {saving ? "Réinitialisation…" : "Créer le nouvel accès"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResettingMember(null)}
              disabled={saving}
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="space-y-3 p-6" aria-label="Chargement de l’équipe">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun membre n’est encore associé à cette organisation.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted">
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">Membre</th>
                  <th className="px-5 py-3">Fonction</th>
                  <th className="px-5 py-3">Accès</th>
                  <th className="px-5 py-3">Statut</th>
                  {canManage && <th className="px-5 py-3">Action</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-foreground">
                        {member.user.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="badge-neutral">
                        {getTeamMemberTitle(member.role, member.user)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {getTeamAccessLabel(member.role)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          member.user.isActive
                            ? "badge-success"
                            : "badge-danger"
                        }
                      >
                        {member.user.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-4">
                        {member.passwordResetAllowed !== false &&
                          (member.role !== "OWNER" || role === "OWNER") && (
                          <button
                            type="button"
                            className="btn-secondary min-h-10 whitespace-nowrap px-3 py-2 text-xs"
                            onClick={() => openPasswordReset(member)}
                          >
                            <KeyRound className="mr-2" size={14} />
                            Réinitialiser l’accès
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
