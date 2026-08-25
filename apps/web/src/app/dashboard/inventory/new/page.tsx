"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";

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
  const [form, setForm] = useState({
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
    description: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/v1/vehicles", {
        method: "POST",
        body: JSON.stringify({
          vin: form.vin || null,
          stockNumber: form.stockNumber || null,
          year: form.year ? parseInt(form.year) : null,
          make: form.make || null,
          model: form.model || null,
          trim: form.trim || null,
          mileage: form.mileage ? parseInt(form.mileage) : null,
          price: form.price ? parseFloat(form.price) : null,
          exteriorColor: form.exteriorColor || null,
          transmission: form.transmission || null,
          fuelType: form.fuelType || null,
          description: form.description || null,
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

  const fields = [
    { key: "vin", label: "VIN" },
    { key: "stockNumber", label: "Numéro de stock" },
    { key: "year", label: "Année", type: "number" },
    { key: "make", label: "Marque" },
    { key: "model", label: "Modèle" },
    { key: "trim", label: "Version" },
    { key: "mileage", label: "Kilométrage", type: "number" },
    { key: "price", label: "Prix", type: "number" },
    { key: "exteriorColor", label: "Couleur extérieure" },
    { key: "transmission", label: "Transmission" },
    { key: "fuelType", label: "Type de carburant" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ajouter un véhicule</h1>
      <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">
                {f.label}
              </label>
              <input
                type={f.type ?? "text"}
                className="input"
                value={form[f.key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="input h-24"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
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
