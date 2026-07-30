import { login, setSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const principal = await login(email, password);

  if (!principal) {
    redirect("/login?error=invalid");
  }

  await setSessionCookie(principal);
  redirect("/dashboard");
}
