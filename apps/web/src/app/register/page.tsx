import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import {
  isPublicSignupEnabled,
  PUBLIC_SIGNUP_CLOSED_MESSAGE,
} from "@/lib/signup";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  if (!isPublicSignupEnabled()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#d9f0ff_0%,#f6faff_42%,#edf3f9_100%)] px-4 py-8">
        <div className="card w-full max-w-md rounded-2xl p-7 sm:p-8 text-center">
          <BrandMark className="justify-center" />
          <h1 className="brand-display mt-6 text-2xl font-black tracking-tight text-slate-950">
            Inscriptions fermées
          </h1>
          <p className="text-slate-600 mt-3">{PUBLIC_SIGNUP_CLOSED_MESSAGE}</p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  return <RegisterForm />;
}
