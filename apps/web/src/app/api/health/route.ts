import { NextResponse } from 'next/server';
import { prisma } from '@okauto/database';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503 });
  }
}
