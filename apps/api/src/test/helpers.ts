import { createPrismaClient, type PrismaClient } from "@okauto/db";
import type { FastifyInstance } from "fastify";
import { loadConfig, type AppConfig } from "../config.js";
import { buildServer, type BuiltServer } from "../server.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://okauto:okauto_dev_password@localhost:5432/okauto_test";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-test-secret-1234",
      RUN_WORKER: "false",
      API_PORT: "0",
      CORS_ORIGINS: "http://localhost:3000",
    } as NodeJS.ProcessEnv),
    ...overrides,
  };
}

let sharedPrisma: PrismaClient | null = null;

export function testPrisma(): PrismaClient {
  if (!sharedPrisma) sharedPrisma = createPrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  return sharedPrisma;
}

const TABLES = [
  "Notification",
  "ListingEvent",
  "Listing",
  "PriceHistory",
  "VehiclePhoto",
  "Vehicle",
  "ImportRun",
  "ImportSource",
  "DescriptionTemplate",
  "AuditLog",
  "ExtensionToken",
  "Invite",
  "Membership",
  "RefreshToken",
  "Organization",
  "User",
  "Job",
] as const;

export async function resetDb(prisma: PrismaClient = testPrisma()): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function buildTestServer(overrides: Partial<AppConfig> = {}): Promise<BuiltServer> {
  const prisma = testPrisma();
  return buildServer({ config: testConfig(overrides), prisma, startWorker: false });
}

export interface TestAccount {
  accessToken: string;
  userId: string;
  orgId: string;
  email: string;
}

/** Registers a fresh org+owner through the real API surface. */
export async function registerOrg(
  app: FastifyInstance,
  input: { email: string; orgName: string; name?: string },
): Promise<TestAccount> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: input.email,
      password: "test-password-123",
      name: input.name ?? input.email.split("@")[0]!,
      orgName: input.orgName,
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const body = res.json() as { accessToken: string; user: { id: string }; org: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id, orgId: body.org.id, email: input.email };
}

export function authHeaders(account: TestAccount, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${account.accessToken}`,
    "x-org-id": account.orgId,
    ...extra,
  };
}

/** Creates an additional member directly in the DB (avoids invite-flow ceremony in tests). */
export async function addMember(
  prisma: PrismaClient,
  params: { email: string; name: string; orgId: string; role: "ORG_OWNER" | "ORG_MANAGER" | "SALESPERSON" },
): Promise<{ userId: string; membershipId: string }> {
  const { hashPassword } = await import("../lib/passwords.js");
  const user = await prisma.user.create({
    data: { email: params.email, name: params.name, passwordHash: await hashPassword("test-password-123") },
  });
  const membership = await prisma.membership.create({
    data: { userId: user.id, orgId: params.orgId, role: params.role },
  });
  return { userId: user.id, membershipId: membership.id };
}

export async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "test-password-123" },
  });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.body}`);
  return (res.json() as { accessToken: string }).accessToken;
}

export async function createVehicleDirect(
  prisma: PrismaClient,
  orgId: string,
  data: Partial<{
    vin: string;
    stockNumber: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    priceCents: number;
    status: "ACTIVE" | "SOLD" | "SUSPECTED_SOLD" | "ARCHIVED" | "PRICE_CHANGED";
    sourceId: string;
  }> = {},
) {
  return prisma.vehicle.create({
    data: {
      orgId,
      vin: data.vin ?? null,
      stockNumber: data.stockNumber ?? `ST-${Math.random().toString(36).slice(2, 8)}`,
      year: data.year ?? 2020,
      make: data.make ?? "Toyota",
      model: data.model ?? "Camry",
      mileage: data.mileage ?? null,
      priceCents: data.priceCents ?? 15_000_00,
      status: data.status ?? "ACTIVE",
      sourceId: data.sourceId ?? null,
    },
  });
}
