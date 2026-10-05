import { isPublicSignupEnabled } from "@/lib/signup";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <LoginForm publicSignupEnabled={isPublicSignupEnabled()} />;
}
