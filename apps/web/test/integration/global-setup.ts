import { execSync } from "node:child_process";
import path from "node:path";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lotpilot_test";

/**
 * Prepare the test database: apply the committed migrations (which doubles as
 * a migration validity check), then truncate all data tables.
 */
export default async function setup(): Promise<void> {
  const dbPackageDir = path.resolve(__dirname, "../../../../packages/db");
  execSync("npx prisma migrate deploy", {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { PrismaClient } = await import("@lotpilot/db");
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
