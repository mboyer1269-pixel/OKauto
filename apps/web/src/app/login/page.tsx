import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="login-page">
      <section className="card login-card" aria-labelledby="login-title">
        <div className="brand" style={{ color: "#172033", marginBottom: 24 }}>
          <span className="brand-mark" aria-hidden="true">
            OK
          </span>
          <span>OKauto ListingOps</span>
        </div>
        <p className="eyebrow">Secure dealer workspace</p>
        <h1 id="login-title">Sign in to manage inventory listings</h1>
        <p className="muted">
          Demo seed users use <strong>owner@okauto.test</strong> and password{" "}
          <strong>okauto-demo-pass</strong>.
        </p>
        {params.error ? (
          <p className="badge badge-critical" role="alert">
            {params.error === "invalid" ? "Invalid email or password." : "Unable to sign in."}
          </p>
        ) : null}
        <form className="form" action="/api/auth/login" method="post">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue="owner@okauto.test" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" defaultValue="okauto-demo-pass" required />
          </div>
          <button className="button" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
