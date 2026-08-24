import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma, Role } from "@okauto/database";
import type { RoleType } from "@okauto/shared";

function getJwtSecret(): Uint8Array {
  const configuredJwtSecret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredJwtSecret) {
    throw new Error("JWT_SECRET is required in production");
  }
  return new TextEncoder().encode(
    configuredJwtSecret ?? "dev-secret-change-in-production-32chars",
  );
}

export interface TokenPayload {
  sub: string;
  email: string;
  orgId: string;
  role: RoleType;
}

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_ACCESS_EXPIRY ?? "15m")
    .sign(getJwtSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function generateApiKey(): string {
  return "suivia_" + crypto.randomBytes(32).toString("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return token;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function validateRefreshToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { memberships: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    if (record) await prisma.refreshToken.delete({ where: { id: record.id } });
    return null;
  }

  return record;
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

export async function getAuthFromRequest(
  request: NextRequest,
): Promise<TokenPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function getAuthFromCookies(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function getMembership(userId: string, orgId: string) {
  return prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
  });
}

export async function authenticateApiKey(apiKey: string) {
  const keyHash = hashToken(apiKey);
  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: {
      user: true,
      organization: true,
    },
  });

  if (!record || !record.isActive) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: record.organizationId,
        userId: record.userId,
      },
    },
  });

  return {
    user: record.user,
    organization: record.organization,
    role: membership?.role ?? Role.SALESPERSON,
    orgId: record.organizationId,
  };
}

export async function createAuditLog(params: {
  organizationId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: NextRequest;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      action: params.action as never,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata as never,
      ipAddress: params.request?.headers.get("x-forwarded-for") ?? undefined,
      userAgent: params.request?.headers.get("user-agent") ?? undefined,
    },
  });
}
