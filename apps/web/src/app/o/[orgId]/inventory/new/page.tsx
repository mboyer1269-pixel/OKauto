"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";

interface Decoded {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyStyle: string | null;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  engine: string | null;
  source: string;
}

export default function NewVehiclePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [fields, setFields] = useState({
    vin: "",
    stockNumber: "",
    year: "",
    make: "",
    model: "",
    trim: "",
    bodyStyle: "",
    drivetrain: "",
    transmission: "",
    fuelType: "",
    engine: "",
    exteriorColor: "",
    interiorColor: "",
    mileage: "",
    price: "",
    condition: "USED",
    photoUrls: "",
  });

  function set<K extends keyof typeof fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function decodeVin() {
    setDecoding(true);
    setError(null);
    setNotice(null);
    try {
      const { decoded } = await api<{ decoded: Decoded }>("/api/v1/vin/decode", {
        method: "POST",
        json: { vin: fields.vin },
      });
      setFields((f) => ({
        ...f,
        year: decoded.year != null ? String(decoded.year) : f.year,
        make: decoded.make ?? f.make,
        model: decoded.model ?? f.model,
        trim: decoded.trim ?? f.trim,
        bodyStyle: decoded.bodyStyle ?? f.bodyStyle,
        fuelType: decoded.fuelType ?? f.fuelType,
        transmission: decoded.transmission ?? f.transmission,
        drivetrain: decoded.drivetrain ?? f.drivetrain,
        engine: decoded.engine ?? f.engine,
      }));
      setNotice(
        decoded.source === "vpic"
          ? "VIN decoded via NHTSA — review and fill in the rest."
          : "VIN decoded offline (year/make only) — fill in the rest manually.",
      );
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "VIN decode failed");
    } finally {
      setDecoding(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const photoUrls = fields.photoUrls
        .split(/\n+/)
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//.test(u));
      const { vehicle } = await api<{ vehicle: { id: string } }>(`/api/v1/orgs/${orgId}/vehicles`, {
        method: "POST",
        json: {
          vin: fields.vin || null,
          stockNumber: fields.stockNumber || null,
          year: fields.year ? Number(fields.year) : null,
          make: fields.make,
          model: fields.model,
          trim: fields.trim || null,
          bodyStyle: fields.bodyStyle || null,
          drivetrain: fields.drivetrain || null,
          transmission: fields.transmission || null,
          fuelType: fields.fuelType || null,
          engine: fields.engine || null,
          exteriorColor: fields.exteriorColor || null,
          interiorColor: fields.interiorColor || null,
          mileage: fields.mileage ? Number(fields.mileage.replace(/[^\d]/g, "")) : null,
          priceCents: fields.price ? Math.round(Number(fields.price.replace(/[^\d.]/g, "")) * 100) : null,
          condition: fields.condition,
          photoUrls,
        },
      });
      router.push(`/o/${orgId}/inventory/${vehicle.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not create the vehicle");
      setBusy(false);
    }
  }

  const text = (key: keyof typeof fields, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="label" htmlFor={key}>
        {label}
      </label>
      <input
        className="input"
        id={key}
        value={fields[key]}
        onChange={(e) => set(key, e.target.value)}
        {...props}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Add a vehicle</h1>
      <form onSubmit={onSubmit} className="card space-y-5 p-6">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="vin">
              VIN
            </label>
            <input
              className="input font-mono uppercase"
              id="vin"
              value={fields.vin}
              onChange={(e) => set("vin", e.target.value.toUpperCase())}
              maxLength={17}
              placeholder="17-character VIN"
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={decodeVin}
            disabled={decoding || fields.vin.length !== 17}
          >
            {decoding ? "Decoding…" : "Decode VIN"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {text("year", "Year", { inputMode: "numeric" })}
          {text("make", "Make *", { required: true })}
          {text("model", "Model *", { required: true })}
          {text("trim", "Trim")}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {text("stockNumber", "Stock #")}
          {text("mileage", "Mileage", { inputMode: "numeric" })}
          {text("price", "Price ($)", { inputMode: "decimal" })}
          <div>
            <label className="label" htmlFor="condition">
              Condition
            </label>
            <select
              className="input"
              id="condition"
              value={fields.condition}
              onChange={(e) => set("condition", e.target.value)}
            >
              <option value="USED">Used</option>
              <option value="NEW">New</option>
              <option value="CERTIFIED_PRE_OWNED">Certified pre-owned</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {text("bodyStyle", "Body style")}
          {text("drivetrain", "Drivetrain")}
          {text("transmission", "Transmission")}
          {text("fuelType", "Fuel type")}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {text("engine", "Engine")}
          {text("exteriorColor", "Exterior color")}
          {text("interiorColor", "Interior color")}
        </div>
        <div>
          <label className="label" htmlFor="photoUrls">
            Photo URLs (one per line)
          </label>
          <textarea
            className="input min-h-24"
            id="photoUrls"
            value={fields.photoUrls}
            onChange={(e) => set("photoUrls", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save vehicle"}
          </button>
        </div>
      </form>
    </div>
  );
}
