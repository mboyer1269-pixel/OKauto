"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";

export function VehicleAdminActions({
  orgId,
  vehicleId,
  status,
}: {
  orgId: string;
  vehicleId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/vehicles/${vehicleId}`, {
        method: "PATCH",
        json: { status: next },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status !== "SOLD" ? (
          <button className="btn-secondary" disabled={busy} onClick={() => setStatus("SOLD")}>
            Mark sold
          </button>
        ) : (
          <button className="btn-secondary" disabled={busy} onClick={() => setStatus("AVAILABLE")}>
            Mark available
          </button>
        )}
        {status !== "ARCHIVED" ? (
          <button className="btn-danger" disabled={busy} onClick={() => setStatus("ARCHIVED")}>
            Archive
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
