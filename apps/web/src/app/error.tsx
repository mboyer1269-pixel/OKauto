"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card max-w-md text-center">
        <h2 className="mb-2 text-xl font-bold text-destructive">
          Une erreur est survenue
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {error.message || "Erreur inattendue."}
        </p>
        <button onClick={reset} className="btn-primary">
          Réessayer
        </button>
      </div>
    </div>
  );
}
