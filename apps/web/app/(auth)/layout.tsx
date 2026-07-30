export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-black text-white">
            OK
          </div>
          <h1 className="text-lg font-bold text-ink-200">OKauto</h1>
          <p className="text-sm text-ink-400">Dealership listing assistant</p>
        </div>
        {children}
      </div>
    </main>
  );
}
