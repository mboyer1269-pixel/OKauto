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

function isPlausibleIp(value: string): boolean {
  if (value.length === 0 || value.length > 45 || value.includes(" ")) {
    return false;
  }
  return /^[0-9a-fA-F:.]+$/.test(value);
}

export function getClientIp(request: Request, env: Env = process.env): string {
  if (isTrustedProxyEnabled(env)) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const candidate = forwarded.split(",")[0]?.trim();
      if (candidate && isPlausibleIp(candidate)) return candidate;
    }
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp && isPlausibleIp(realIp)) return realIp;
  }
  return "unknown";
}
