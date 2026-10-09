"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isValidVinFormat,
  mergeVinDecodeIntoForm,
  normalizeVin,
  VIN_DECODE_FIELD_LABELS_FR,
  type VinDecodeField,
  type VinDecodeResult,
} from "@okauto/shared";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";

const INITIAL_FORM = {
  vin: "",
  stockNumber: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  mileage: "",
  price: "",
  exteriorColor: "",
  transmission: "",
  fuelType: "",
  bodyStyle: "",
  drivetrain: "",
  engine: "",
  description: "",
  condition: "Used",
};

type FormState = typeof INITIAL_FORM;
type DecodeStatus = "idle" | "loading" | "success" | "error";

export default function NewVehiclePage() {
  return (
    <ProtectedRoute>
      <NewVehicleForm />
    </ProtectedRoute>
  );
}

function NewVehicleForm() {
  const { apiFetch } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>("idle");
  const [decodeMessage, setDecodeMessage] = useState("");
  const lastDecodedVin = useRef("");
  const lastFilledFields = useRef<VinDecodeField[]>([]);
  const formRef = useRef(form);
  formRef.current = form;

  const applyDecode = (decoded: VinDecodeResult, current: FormState) => {
    const preview = mergeVinDecodeIntoForm(current, decoded);
    if (preview.ignored) return current;
    setForm((prev) => {
      const merged = mergeVinDecodeIntoForm(prev, decoded);
      return merged.ignored ? prev : (merged.next as FormState);
    });
    const filledLabels = preview.filled
      .map((field) => VIN_DECODE_FIELD_LABELS_FR[field])
      .filter(Boolean);
    const skippedLabels = preview.skipped
      .map((field) => VIN_DECODE_FIELD_LABELS_FR[field as VinDecodeField])
      .filter(Boolean);
    const parts: string[] = [];
    if (filledLabels.length) {
      parts.push(`Complété : ${filledLabels.join(", ")}.`);
    } else {
      parts.push("Aucune donnée manquante à compléter.");
    }
    if (skippedLabels.length) {
      parts.push(
        `Déjà saisi, conservé : ${skippedLabels.join(", ")} (les données du concessionnaire priment).`,
      );
    }
    setDecodeStatus("success");
    setDecodeMessage(parts.join(" "));
    lastDecodedVin.current = decoded.vin;
    lastFilledFields.current = preview.filled;
    return preview.next as FormState;
  };

  const decodeVinIntoForm = async (vin: string) => {
    setDecodeStatus("loading");
    setDecodeMessage("Décodage du NIV…");
    try {
      const res = await apiFetch("/api/v1/vehicles/decode-vin", {
        method: "POST",
        body: JSON.stringify({ vin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        decode?: VinDecodeResult;
        error?: string;
      };
      if (normalizeVin(formRef.current.vin) !== normalizeVin(vin)) {
        return formRef.current;
      }
      if (!res.ok || !data.decode) {
        setDecodeStatus("error");
        setDecodeMessage(data.error ?? "Le NIV n’a pas pu être décodé.");
        return formRef.current;
      }
      return applyDecode(data.decode, formRef.current);
    } catch {
      setDecodeStatus("error");
      setDecodeMessage(
        "Le service de décodage NHTSA (vPIC) est indisponible. Réessayez plus tard.",
      );
      return formRef.current;
    }
  };

  useEffect(() => {
    const vin = form.vin;
    if (!isValidVinFormat(vin)) {
      if (decodeStatus === "loading") return;
      return;
    }
    const normalized = normalizeVin(vin);
    if (normalized === lastDecodedVin.current) return;
    const handle = window.setTimeout(() => {
      void decodeVinIntoForm(normalized);
    }, 400);
    return () => window.clearTimeout(handle);
    // Only re-run when the VIN changes; applying decode updates other fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let payload = form;
      if (
        isValidVinFormat(form.vin) &&
        lastDecodedVin.current !== normalizeVin(form.vin)
      ) {
        payload = await decodeVinIntoForm(normalizeVin(form.vin));
      }
      const decodedVin = lastDecodedVin.current === normalizeVin(payload.vin);
      const res = await apiFetch("/api/v1/vehicles", {
        method: "POST",
        body: JSON.stringify({
          vin: payload.vin || null,
          stockNumber: payload.stockNumber || null,
          year: payload.year ? parseInt(payload.year, 10) : null,
          make: payload.make || null,
          model: payload.model || null,
          trim: payload.trim || null,
          mileage: payload.mileage ? parseInt(payload.mileage, 10) : null,
          price: payload.price ? parseFloat(payload.price) : null,
          exteriorColor: payload.exteriorColor || null,
          transmission: payload.transmission || null,
          fuelType: payload.fuelType || null,
          bodyStyle: payload.bodyStyle || null,
          drivetrain: payload.drivetrain || null,
          engine: payload.engine || null,
          description: payload.description || null,
          condition: payload.condition || null,
          vinDecoded: decodedVin,
          vinDecodedFields: decodedVin ? lastFilledFields.current : [],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const vehicle = await res.json();
      router.push(`/dashboard/inventory/${vehicle.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Le véhicule n’a pas pu être créé.",
      );
    } finally {
      setLoading(false);
    }
  };

  const fields: Array<{ key: keyof FormState; label: string; type?: string }> =
    [
      { key: "stockNumber", label: "Numéro de stock" },
      { key: "year", label: "Année", type: "number" },
      { key: "make", label: "Marque" },
      { key: "model", label: "Modèle" },
      { key: "trim", label: "Version" },
      { key: "mileage", label: "Kilométrage", type: "number" },
      { key: "price", label: "Prix", type: "number" },
      { key: "exteriorColor", label: "Couleur extérieure" },
      { key: "bodyStyle", label: "Carrosserie" },
      { key: "drivetrain", label: "Traction" },
      { key: "engine", label: "Moteur" },
      { key: "transmission", label: "Transmission" },
      { key: "fuelType", label: "Type de carburant" },
    ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ajouter un véhicule</h1>
      <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="vin">
            NIV
          </label>
          <input
            id="vin"
            type="text"
            className="input font-mono uppercase"
            autoComplete="off"
            maxLength={17}
            value={form.vin}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                vin: e.target.value.toUpperCase(),
              }))
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Un NIV valide de 17 caractères est décodé automatiquement (NHTSA
            vPIC, gratuit). Seuls les champs vides sont remplis.
          </p>
          {decodeStatus !== "idle" && (
            <div
              className={
                decodeStatus === "error"
                  ? "mt-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                  : decodeStatus === "loading"
                    ? "mt-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"
                    : "mt-2 rounded-lg bg-signal/10 p-3 text-sm text-signal"
              }
              role="status"
            >
              {decodeMessage}
            </div>
          )}
          {decodeStatus === "error" && isValidVinFormat(form.vin) && (
            <button
              type="button"
              className="btn-secondary mt-2 text-sm"
              onClick={() => {
                lastDecodedVin.current = "";
                void decodeVinIntoForm(normalizeVin(form.vin));
              }}
            >
              Relancer le décodage
            </button>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="condition">
            État
          </label>
          <select
            id="condition"
            className="input"
            value={form.condition}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                condition: e.target.value,
              }))
            }
          >
            <option value="Used">Occasion</option>
            <option value="New">Neuf</option>
            <option value="Demo">Démonstrateur</option>
          </select>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">
                {f.label}
              </label>
              <input
                type={f.type ?? "text"}
                className="input"
                value={form[f.key]}
                onChange={(e) =>
                  setForm((current) => ({ ...current, [f.key]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="input h-24"
            value={form.description}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                description: e.target.value,
              }))
            }
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || decodeStatus === "loading"}
          >
            {loading ? "Enregistrement…" : "Enregistrer le véhicule"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.back()}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
