export function isPublicSignupEnabled(): boolean {
  const value = process.env["ALLOW_PUBLIC_SIGNUP"]?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export const PUBLIC_SIGNUP_CLOSED_MESSAGE =
  "Les inscriptions publiques sont fermées. Demandez une invitation à un administrateur.";
