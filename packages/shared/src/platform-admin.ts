import { readEnv } from "./job-policy";

export function parsePlatformAdminUserIds(
  raw: string | undefined | null,
): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isPlatformAdminUserId(
  userId: string | null | undefined,
  raw: string | undefined | null = readEnv().PLATFORM_ADMIN_USER_IDS,
): boolean {
  if (!userId) return false;
  const allowlist = parsePlatformAdminUserIds(raw);
  if (allowlist.length === 0) return false;
  return allowlist.includes(userId.trim());
}
