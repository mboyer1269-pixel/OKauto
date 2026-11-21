"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { renderVehicleVideo } from "@/lib/vehicle-video";

export function VehicleVideo({
  id,
  title,
  count,
}: {
  id: string;
  title: string;
  count: number;
}) {
  const { apiFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<{
    url: string;
    extension: string;
  } | null>(null);
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
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
    setOutput(null);
    try {
      for (let i = 0; i < Math.min(6, count); i++) {
        const response = await apiFetch(
          `/api/v1/vehicles/${id}/photos/download?index=${i}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(`Impossible de charger la photo ${i + 1}.`);
        images.push(await createImageBitmap(await response.blob()));
      }
      const video = await renderVehicleVideo(images, title, controller.signal);
      controller.signal.throwIfAborted();
      setOutput({
        url: URL.createObjectURL(video),
        extension: video.type.includes("mp4") ? "mp4" : "webm",
      });
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Impossible de créer la vidéo.",
        );
    } finally {
      images.forEach((image) => image.close());
      job.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Vidéo publicitaire</h2>
      <p className="text-sm text-muted-foreground">
        {count
          ? "Un montage vertical avec les photos du véhicule et une invitation à réserver un essai."
          : "Ajoutez une photo pour créer la vidéo."}
      </p>
      <button
        className="btn-secondary"
        type="button"
        disabled={busy || !count}
        onClick={generate}
      >
        {busy
          ? "Création en cours… gardez cet onglet ouvert"
          : "Créer la vidéo"}
      </button>
      {error && <p role="alert">{error}</p>}
      {output && (
        <div className="space-y-2">
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
