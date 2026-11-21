// Capture the real photos at their original aspect ratio, including portrait shots.
export async function renderVehicleVideo(
  images: ImageBitmap[],
  title: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (!images.length) throw new Error("Ajoutez une photo au véhicule.");
  const mime = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ].find(
    (type) =>
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type),
  );
  if (!mime)
    throw new Error(
      "Ouvrez la fiche dans un navigateur compatible avec l’export vidéo.",
    );
  signal.throwIfAborted();

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.captureStream)
    throw new Error("La création vidéo est indisponible dans ce navigateur.");
  const duration = Math.max(6, images.length * 2.5) * 1000;
  function draw(elapsed: number) {
    if (!ctx) return;
    const frame = Math.min(
      images.length - 1,
      Math.floor((elapsed / duration) * images.length),
    );
    const photo = images[frame];
    ctx.fillStyle = "#101923";
    ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = "#e7c689";
    ctx.fillRect(48, 140, 80, 5);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText(title, 48, 227, 624);
    const scale = Math.min(720 / photo.width, 760 / photo.height);
    const w = photo.width * scale,
      h = photo.height * scale;
    ctx.drawImage(photo, (720 - w) / 2, 270 + (760 - h) / 2, w, h);
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("Écrivez-nous pour un essai", 48, 1120, 624);
    ctx.fillStyle = "#e7c689";
    ctx.fillRect(48, 1160, 624 * Math.min(1, elapsed / duration), 4);
  }

  draw(0);
  const stream = canvas.captureStream(24);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 3500000,
    });
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      const abort = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      signal.addEventListener("abort", abort, { once: true });
      recorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      recorder.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("L’export vidéo a échoué."));
      };
      recorder.onstop = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else if (chunks.length)
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        else reject(new Error("La vidéo est vide. Relancez la génération."));
      };
      recorder.start();
      const start = performance.now();
      timer = setInterval(() => {
        const elapsed = performance.now() - start;
        draw(elapsed);
        if (elapsed >= duration && recorder.state !== "inactive")
          recorder.stop();
      }, 1000 / 24);
    });
  } finally {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
  }
}
