import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@okauto/shared";
import type { Env } from "./env.js";

export type AccessClaims = {
  sub: string;
  email: string;
  typ: "access";
};

export type RefreshClaims = {
  sub: string;
  typ: "refresh";
  jti: string;
};

export function signAccessToken(
  env: Env,
  payload: Omit<AccessClaims, "typ">,
): string {
  return jwt.sign({ ...payload, typ: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(
  env: Env,
  userId: string,
): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, typ: "refresh", jti } satisfies RefreshClaims,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"] },
  );
  return { token, jti };
}

export function verifyAccessToken(env: Env, token: string): AccessClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
  if (decoded.typ !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function verifyRefreshToken(env: Env, token: string): RefreshClaims {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
  if (decoded.typ !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseTtlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type OrgContext = {
  organizationId: string;
  role: Role;
  membershipId: string;
};
