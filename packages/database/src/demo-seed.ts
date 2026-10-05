const DEMO_EMAIL_DOMAIN = "@demo.okauto.local";

export function isDemoSeedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
}

/**
 * Demo users are for local/CI only. Production must never create or
 * re-attach owner@demo.okauto.local (and siblings) to a live dealership.
 */
export function shouldCreateDemoAccounts(
  env: NodeJS.Dict<string> = process.env,
): boolean {
  if (env.ALLOW_DEMO_SEED === "true") return true;
  if (env.ALLOW_DEMO_SEED === "false") return false;
  return env.NODE_ENV !== "production";
}
