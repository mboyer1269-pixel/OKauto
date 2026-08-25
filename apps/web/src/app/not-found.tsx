import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-brand-700">404</h1>
        <p className="text-xl text-slate-600 mt-4 mb-8">Page introuvable</p>
        <div className="flex gap-4 justify-center">
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
