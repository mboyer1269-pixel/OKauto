import Link from "next/link";
import { ThemedBrandLockup } from "@/components/themed-brand-mark";
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
          <Link href="/login" className="btn-primary mt-6 inline-flex">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return <RegisterForm />;
}
