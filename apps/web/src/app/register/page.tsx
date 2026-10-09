import Link from "next/link";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
import {
  accessRequestCopy,
  accessRequestHrefs,
} from "@/content/access-request";
import { landingCopy, landingHrefs } from "@/content/landing";
import {
  isPublicSignupEnabled,
  PUBLIC_SIGNUP_CLOSED_MESSAGE,
} from "@/lib/signup";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  if (!isPublicSignupEnabled()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="card w-full max-w-md rounded-2xl p-7 text-center sm:p-8">
          <ThemedBrandLockup className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-bold tracking-tight">
            Inscriptions fermées
          </h1>
          <p className="mt-3 text-muted-foreground">{PUBLIC_SIGNUP_CLOSED_MESSAGE}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link href={landingHrefs.login} className="btn-primary inline-flex">
              {landingCopy.nav.login}
            </Link>
            <Link
              href={accessRequestHrefs.form}
              className="btn-secondary inline-flex"
            >
              {accessRequestCopy.title}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <RegisterForm />;
}
