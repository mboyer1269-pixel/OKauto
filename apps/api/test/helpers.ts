import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, type AppContext } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db/client.js";
import { createAiService } from "../src/services/ai.js";
import { createVinDecoder } from "../src/services/vinDecoder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TestHarness {
  app: FastifyInstance;
  db: Db;
  ctx: AppContext;
  close: () => Promise<void>;
}

/**
 * Build a fully-wired app against an in-memory Postgres (PGlite), running
 * the exact SQL migrations that production uses.
 */
export async function createTestHarness(overrides: Partial<AppContext> = {}): Promise<TestHarness> {
  const pglite = new PGlite();
  const pgliteDb = drizzle(pglite);
  await migrate(pgliteDb, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  // PGlite-backed drizzle satisfies the same query interface as the
  // postgres-js-backed one; the cast keeps a single Db type app-wide.
  const db = pgliteDb as unknown as Db;

  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-test-secret-123456",
    WORKER_INLINE: "false",
    ENABLE_NHTSA_DECODER: "false",
    LOG_LEVEL: "silent",
  } as NodeJS.ProcessEnv);

  const ctx: AppContext = {
    config,
    db,
    ai: createAiService({ OPENAI_API_KEY: undefined, OPENAI_BASE_URL: "https://unused", OPENAI_MODEL: "unused" }),
    decodeVin: createVinDecoder({ enableNhtsa: false }),
    fetchImpl: (() => {
      throw new Error("fetch not stubbed in this test");
    }) as unknown as typeof fetch,
    ...overrides,
  };

  const app = await buildApp(ctx);
  await app.ready();
  return {
    app,
    db,
    ctx,
    close: async () => {
      await app.close();
      await pglite.close();
    },
  };
}

export interface TestUser {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

let userCounter = 0;

export async function registerUser(app: FastifyInstance, overrides: Partial<{ email: string; name: string; password: string }> = {}): Promise<TestUser> {
  userCounter++;
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: overrides.email ?? `user${userCounter}-${Date.now()}@test.dev`,
      password: overrides.password ?? "Str0ngPassw0rd!",
      name: overrides.name ?? `Test User ${userCounter}`,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`registerUser failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user };
}

export async function createOrg(app: FastifyInstance, token: string, name = "Test Motors"): Promise<{ id: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/orgs",
    headers: { authorization: `Bearer ${token}` },
    payload: { name, city: "Austin", region: "TX", phone: "(555) 111-2222" },
  });
  if (response.statusCode !== 201) {
    throw new Error(`createOrg failed: ${response.statusCode} ${response.body}`);
  }
  return { id: response.json().org.id };
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Join a user to an org with a role via the invite flow. */
export async function addMember(
  app: FastifyInstance,
  ownerToken: string,
  orgId: string,
  role: "OWNER" | "MANAGER" | "SALESPERSON",
): Promise<TestUser> {
  const member = await registerUser(app);
  const inviteRes = await app.inject({
    method: "POST",
    url: `/api/v1/orgs/${orgId}/invites`,
    headers: auth(ownerToken),
    payload: { email: member.user.email, role },
  });
  if (inviteRes.statusCode !== 201) throw new Error(`invite failed: ${inviteRes.body}`);
  const token = inviteRes.json().invite.token;
  const acceptRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/invites/accept",
    headers: auth(member.accessToken),
    payload: { token },
  });
  if (acceptRes.statusCode !== 200) throw new Error(`accept failed: ${acceptRes.body}`);
  return member;
}

export const SAMPLE_CSV = `VIN,Stock #,Year,Make,Model,Trim,Body,Miles,Price,Ext Color,Transmission,Fuel Type,Photos
1HGCM82633A004352,P1001,2003,Honda,Accord,EX V6,Coupe,"88,412","$8,995",Graphite Pearl,Automatic,Gasoline,https://cdn.test/1.jpg
5YJ3E1EA2KF317000,P1002,2019,Tesla,Model 3,Standard Range Plus,Sedan,"41,200","$27,450",Pearl White,Automatic,Electric,https://cdn.test/2.jpg|https://cdn.test/3.jpg
1FTFW1ET9DFC10312,T2001,2013,Ford,F-150,XLT,Crew Cab Pickup,"112,050","$18,999",Oxford White,Automatic,Gasoline,`;
