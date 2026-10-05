type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

function parseTrustProxyFlag(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
}

export function isTrustedProxyEnabled(env: Env = process.env): boolean {
  const explicit = parseTrustProxyFlag(env["TRUST_PROXY"]);
  if (explicit !== null) return explicit;
  return env.NODE_ENV === "production";
}

export function getTrustedProxyHops(env: Env = process.env): number {
  const raw = env["TRUSTED_PROXY_HOPS"];
  if (raw === undefined || raw.trim() === "") return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 20);
}

function isPlausibleIp(value: string): boolean {
  if (value.length === 0 || value.length > 45 || value.includes(" ")) {
    return false;
  }
  return /^[0-9a-fA-F:.]+$/.test(value);
}

function pickClientIpFromForwarded(
  forwarded: string,
  trustedHops: number,
): string | null {
  const hops = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(isPlausibleIp);
  if (hops.length === 0) return null;
  const index = Math.max(0, hops.length - trustedHops);
  return hops[index] ?? null;
}

export function getClientIp(request: Request, env: Env = process.env): string {
  if (!isTrustedProxyEnabled(env)) return "unknown";

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isPlausibleIp(realIp)) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const candidate = pickClientIpFromForwarded(
      forwarded,
      getTrustedProxyHops(env),
    );
    if (candidate) return candidate;
  }

  return "unknown";
}
