import { prisma } from '@okauto/db';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let db = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'ok';
  } catch {
    db = 'error';
  }
  const status = db === 'ok' ? 200 : 503;
  return NextResponse.json({ status: db === 'ok' ? 'healthy' : 'degraded', db }, { status });
}
