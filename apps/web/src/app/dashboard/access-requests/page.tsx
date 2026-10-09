"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";
import { accessRequestCopy } from "@/content/access-request";
import { formatDateTime } from "@/lib/utils";

interface AccessRequestRow {
  id: string;
  name: string;
  dealership: string;
  email: string;
  phone: string | null;
  message: string;
  consentAt: string;
  createdAt: string;
}

export default function AccessRequestsPage() {
  return (
    <ProtectedRoute>
      <AccessRequestsContent />
    </ProtectedRoute>
  );
}

function AccessRequestsContent() {
  const { apiFetch, isPlatformAdmin } = useAuth();
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin) {
      setLoading(false);
      return;
    }
    apiFetch("/api/v1/access-requests")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data.error ?? "Les demandes n’ont pas pu être chargées.",
          );
        }
        setRequests(data.requests ?? []);
      })
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Les demandes n’ont pas pu être chargées.",
        );
      })
      .finally(() => setLoading(false));
  }, [apiFetch, isPlatformAdmin]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(accessRequestCopy.dashboard.deleteConfirm)) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await apiFetch(`/api/v1/access-requests/${id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error ?? "La demande n’a pas pu être supprimée.",
        );
      }
      setRequests((current) => current.filter((row) => row.id !== id));
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "La demande n’a pas pu être supprimée.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <p className="text-muted-foreground">
        {accessRequestCopy.dashboard.forbidden}
      </p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">
        {accessRequestCopy.dashboard.title}
      </h1>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4">{accessRequestCopy.fields.name}</th>
              <th className="pb-3 pr-4">
                {accessRequestCopy.fields.dealership}
              </th>
              <th className="pb-3 pr-4">{accessRequestCopy.fields.email}</th>
              <th className="pb-3 pr-4">{accessRequestCopy.fields.phone}</th>
              <th className="pb-3 pr-4">{accessRequestCopy.fields.message}</th>
              <th className="pb-3 pr-4">
                {accessRequestCopy.dashboard.consent}
              </th>
              <th className="pb-3">
                <span className="sr-only">
                  {accessRequestCopy.dashboard.actions}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-b last:border-0">
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDateTime(request.createdAt)}
                </td>
                <td className="py-3 pr-4">{request.name}</td>
                <td className="py-3 pr-4">{request.dealership}</td>
                <td className="py-3 pr-4">{request.email}</td>
                <td className="py-3 pr-4">{request.phone ?? "—"}</td>
                <td className="max-w-xs py-3 pr-4 whitespace-pre-wrap">
                  {request.message}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDateTime(request.consentAt)}
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    className="btn-secondary text-destructive"
                    onClick={() => handleDelete(request.id)}
                    disabled={deletingId === request.id}
                  >
                    {accessRequestCopy.dashboard.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && requests.length === 0 && !error && (
          <p className="py-8 text-center text-muted-foreground">
            {accessRequestCopy.dashboard.empty}
          </p>
        )}
      </div>
    </div>
  );
}
