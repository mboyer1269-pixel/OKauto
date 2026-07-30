export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-2xl font-black tracking-tight text-white">
            Lot<span className="text-brand-400">Pilot</span>
          </p>
          <p className="mt-1 text-sm text-brand-200">
            List, manage, and track your inventory on Facebook Marketplace
          </p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
