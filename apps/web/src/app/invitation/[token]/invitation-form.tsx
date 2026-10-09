"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { invitationCopy } from "@/content/invitation";

interface InvitePreview {
  email: string;
  name: string;
  organizationName: string;
  expiresAt: string;
  loginUrl: string;
  prompt: string;
}

export function InvitationForm({ token }: { token: string }) {
  const { user, apiFetch } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/v1/invitations/${token}`);
      const data = (await response.json()) as InvitePreview & { error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error ?? invitationCopy.invalid);
        setLoading(false);
        return;
      }
      setPreview(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const matchingSession = Boolean(
    user &&
      preview &&
      user.email.toLocaleLowerCase("fr-CA") === preview.email,
  );

  const persistSession = (data: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; name: string };
    organization: { id: string; name: string; slug: string };
    role: string;
  }) => {
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("organization", JSON.stringify(data.organization));
    localStorage.setItem("role", data.role);
  };

  const accept = async (body: Record<string, string>) => {
    setSaving(true);
    setError("");
    try {
      const response = matchingSession
        ? await apiFetch(`/api/v1/invitations/${token}/accept`, {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await fetch(`/api/v1/invitations/${token}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = (await response.json()) as {
        error?: string;
        details?: { loginUrl?: string };
        attached?: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: { id: string; email: string; name: string };
        organization?: { id: string; name: string; slug: string };
        role?: string;
      };
      if (response.ok && data.attached) {
        window.location.assign("/dashboard");
        return;
      }
      if (
        response.ok &&
        data.accessToken &&
        data.refreshToken &&
        data.user &&
        data.organization
      ) {
        persistSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
          organization: data.organization,
          role: data.role ?? "SALESPERSON",
        });
        window.location.assign("/dashboard");
        return;
      }
      if (data.details?.loginUrl && !matchingSession) {
        window.location.assign(data.details.loginUrl);
        return;
      }
      throw new Error(data.error ?? invitationCopy.invalid);
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : invitationCopy.invalid,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Chargement de l’invitation…
      </p>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        {error || invitationCopy.invalid}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void accept(matchingSession ? {} : { password });
      }}
    >
      <p className="text-sm font-medium text-foreground">{preview.prompt}</p>
      <p className="text-sm text-muted-foreground">
        Invitation pour <strong>{preview.email}</strong> chez{" "}
        <strong>{preview.organizationName}</strong>.
      </p>
      <p className="text-xs text-muted-foreground">{invitationCopy.noEmail}</p>
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {matchingSession ? (
        <p className="text-sm text-muted-foreground">{invitationCopy.loginHint}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <Link
              href={preview.loginUrl}
              className="font-semibold text-primary hover:underline"
            >
              Se connecter
            </Link>{" "}
            si vous avez déjà un compte, ou créez votre mot de passe ci-dessous.
          </p>
          <label className="block text-sm font-medium">
            {invitationCopy.passwordLabel}
            <input
              className="input mt-1.5"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
            />
          </label>
        </>
      )}
      <button type="submit" className="btn-primary w-full" disabled={saving}>
        {saving
          ? "Enregistrement…"
          : matchingSession
            ? invitationCopy.submitExisting
            : invitationCopy.submitNew}
      </button>
    </form>
  );
}
