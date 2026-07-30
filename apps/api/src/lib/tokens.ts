import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ email: claims.email, name: claims.name, adm: claims.isPlatformAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("openlot-api")
    .setAudience("openlot")
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key);
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { issuer: "openlot-api", audience: "openlot" });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      isPlatformAdmin: payload.adm === true,
    };
  } catch {
    return null;
  }
}

/** Opaque refresh tokens: random 256-bit value; only the SHA-256 hash is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
