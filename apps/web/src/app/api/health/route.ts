import { NextResponse } from "next/server";
import { prisma } from "@okauto/database";
import { deployedVersion } from "@/lib/worker-heartbeat";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = deployedVersion();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      version,
      db: true,
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", version, db: false },
      { status: 503 },
    );
  }
}
