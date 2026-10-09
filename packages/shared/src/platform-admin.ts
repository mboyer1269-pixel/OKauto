export function parsePlatformAdminEmails(
  raw: string | undefined | null,
): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  raw: string | undefined | null = process.env.PLATFORM_ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  const allowlist = parsePlatformAdminEmails(raw);
  if (allowlist.length === 0) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
