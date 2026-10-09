import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="font-mono text-6xl font-bold text-primary">404</h1>
        <p className="mb-8 mt-4 text-xl text-muted-foreground">
          Page introuvable
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/" className="btn-primary">
            Accueil
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
