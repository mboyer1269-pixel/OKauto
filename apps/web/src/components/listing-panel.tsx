"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { Card, CardHeader, StatusBadge } from "@/components/ui";

interface MyListing {
  id: string;
  status: string;
  externalUrl: string | null;
}

/**
 * Human-in-the-loop listing workflow panel.
 * Start listing → (post on Facebook yourself) → paste URL to confirm → delist when sold.
 */
export function ListingPanel({
  orgId,
  vehicleId,
  vehicleStatus,
  myListing,
}: {
  orgId: string;
  vehicleId: string;
  vehicleStatus: string;
  myListing: MyListing | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function start(force = false) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ duplicateWarning: string | null }>(`/api/v1/orgs/${orgId}/listings`, {
        method: "POST",
        json: { vehicleId, force },
      });
      if (data.duplicateWarning) setWarning(data.duplicateWarning);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 409 && !force && err.message.includes("force=true")) {
        setWarning(err.message.replace(" Pass force=true to list it anyway.", ""));
      } else {
        setError(err instanceof ClientApiError ? err.message : "Could not start the listing");
      }
    } finally {
      setBusy(false);
    }
  }

  async function transition(status: string, extra: Record<string, unknown> = {}) {
    if (!myListing) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/listings/${myListing.id}`, {
        method: "PATCH",
        json: { status, ...extra },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="My Marketplace listing"
        subtitle="You post on Facebook yourself — LotPilot prepares everything and tracks the result."
      />
      <div className="space-y-3 p-5">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {warning ? (
          <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>{warning}</p>
            {!myListing ? (
              <button className="mt-1 font-semibold underline" onClick={() => start(true)} disabled={busy}>
                List it anyway
              </button>
            ) : null}
          </div>
        ) : null}

        {!myListing ? (
          <>
            <p className="text-sm text-slate-600">
              Start a listing to prepare this vehicle. Then open{" "}
              <a
                className="font-semibold text-brand-600 hover:underline"
                href="https://www.facebook.com/marketplace/create/vehicle"
                target="_blank"
                rel="noreferrer noopener"
              >
                Marketplace ↗
              </a>{" "}
              with the LotPilot extension to fill the form.
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => start(false)}
              disabled={busy || vehicleStatus !== "AVAILABLE"}
            >
              {vehicleStatus !== "AVAILABLE" ? `Vehicle is ${vehicleStatus.toLowerCase()}` : busy ? "Starting…" : "Start listing"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Status</span>
              <StatusBadge status={myListing.status} />
            </div>
            {myListing.externalUrl ? (
              <a
                href={myListing.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate text-sm font-semibold text-brand-600 hover:underline"
              >
                {myListing.externalUrl}
              </a>
            ) : null}

            {myListing.status === "DRAFT" ? (
              <button className="btn-primary w-full" onClick={() => transition("PREPARED")} disabled={busy}>
                Mark as prepared
              </button>
            ) : null}

            {myListing.status === "PREPARED" ? (
              <div className="space-y-2">
                <label className="label" htmlFor="fb-url">
                  Paste the Facebook listing URL after you publish
                </label>
                <input
                  id="fb-url"
                  className="input"
                  type="url"
                  placeholder="https://www.facebook.com/marketplace/item/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button
                  className="btn-primary w-full"
                  onClick={() => transition("POSTED", { externalUrl: url })}
                  disabled={busy || !url}
                >
                  Confirm posted
                </button>
              </div>
            ) : null}

            {myListing.status === "POSTED" || myListing.status === "DELIST_REQUESTED" ? (
              <>
                {myListing.status === "DELIST_REQUESTED" ? (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    This vehicle was sold or removed. Delete the post on Facebook, then confirm below.
                  </p>
                ) : null}
                <button className="btn-danger w-full" onClick={() => transition("DELISTED")} disabled={busy}>
                  I removed it — confirm delisted
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
