"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { renderVehicleVideo } from "@/lib/vehicle-video";

export function VehicleVideo({
  id,
  title,
  photoIds,
}: {
  id: string;
  title: string;
  photoIds: string[];
}) {
  const { apiFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<{
    url: string;
    extension: string;
    omitted: number;
  } | null>(null);
  const job = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const controller = job.current;
      job.current = null;
      controller?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (output) URL.revokeObjectURL(output.url);
    },
    [output],
  );

  async function generate() {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    const images: ImageBitmap[] = [];
    setBusy(true);
    setError("");
    const selected = photoIds.slice(0, 6);
    const deadline = window.setTimeout(
      () =>
        controller.abort(
          new Error("La création a pris trop de temps. Réessayez."),
        ),
      90000,
    );
    const onHidden = () => {
      if (document.hidden)
        controller.abort(
          new Error(
            "Création interrompue. Relancez-la en gardant cet onglet visible.",
          ),
        );
    };
    document.addEventListener("visibilitychange", onHidden);
    try {
      for (const photoId of selected) {
        controller.signal.throwIfAborted();
        const params = new URLSearchParams({ photoId });
        const response = await apiFetch(
          `/api/v1/vehicles/${id}/photos/download?${params}`,
          { signal: controller.signal },
        ).catch(() => null);
        controller.signal.throwIfAborted();
        if (response?.status === 401 || response?.status === 403) {
          throw new Error("Accès aux photos refusé. Vérifiez votre session.");
        }
        if (!response?.ok) continue;
        try {
          images.push(await createImageBitmap(await response.blob()));
        } catch {
          controller.signal.throwIfAborted();
        }
      }
      if (!images.length)
        throw new Error(
          "Aucune photo lisible. Vérifiez les photos du véhicule et réessayez.",
        );
      const video = await renderVehicleVideo(images, title, controller.signal);
      controller.signal.throwIfAborted();
      setOutput({
        url: URL.createObjectURL(video),
        omitted: selected.length - images.length,
        extension: video.type.includes("mp4") ? "mp4" : "webm",
      });
    } catch (reason) {
      const cause = controller.signal.aborted
        ? controller.signal.reason
        : reason;
      if (job.current === controller)
        setError(
          cause instanceof Error
            ? cause.message
            : "Impossible de créer la vidéo.",
        );
    } finally {
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", onHidden);
      images.forEach((image) => image.close());
      if (job.current === controller) {
        job.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Vidéo publicitaire</h2>
      <p className="text-sm text-muted-foreground">
        {photoIds.length
          ? "Un montage vertical avec les photos du véhicule et une invitation à réserver un essai."
          : "Ajoutez une photo pour créer la vidéo."}
      </p>
      <button
        className="btn-secondary"
        type="button"
        disabled={busy || !photoIds.length}
        onClick={generate}
      >
        {busy
          ? "Création en cours… gardez cet onglet ouvert"
          : "Créer la vidéo"}
      </button>
      {busy && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => job.current?.abort(new Error("Création annulée."))}
        >
          Annuler
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {output && (
        <div className="space-y-2">
          {output.omitted > 0 && (
            <p role="status">
              Photos omises dans cette vidéo : {output.omitted}.
            </p>
          )}
          <video
            controls
            playsInline
            src={output.url}
            className="max-h-80 rounded-lg"
            aria-label={title}
          />
          <a
            className="btn-primary"
            href={output.url}
            download={`${title.replace(/[^\p{L}\p{N}-]+/gu, "-") || id}.${output.extension}`}
          >
            Télécharger la vidéo
          </a>
        </div>
      )}
    </section>
  );
}
