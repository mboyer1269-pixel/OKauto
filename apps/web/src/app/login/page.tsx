import { isPublicSignupEnabled } from "@/lib/signup";
import { safeInvitationNext } from "@/lib/member-provisioning";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <LoginForm
      publicSignupEnabled={isPublicSignupEnabled()}
      next={safeInvitationNext(next)}
    />
  );
}
