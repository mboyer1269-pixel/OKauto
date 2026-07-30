import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@okauto/database';
import bcrypt from 'bcryptjs';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { GET as vehiclesHandler } from '@/app/api/v1/vehicles/route';
import { GET as dashboardHandler } from '@/app/api/v1/analytics/dashboard/route';
import { GET as healthHandler } from '@/app/api/health/route';

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
}

describe('API route handlers', () => {
  let accessToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Demo1234!', 12);
    const user = await prisma.user.upsert({
      where: { email: 'owner@demo.okauto.local' },
      update: { passwordHash },
      create: {
        email: 'owner@demo.okauto.local',
        passwordHash,
        name: 'Alex Owner',
      },
    });

    const org = await prisma.organization.upsert({
      where: { slug: 'demo-motors' },
      update: {},
      create: { name: 'Demo Motors', slug: 'demo-motors' },
    });

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role: 'OWNER' },
      create: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
  });

  it('health endpoint returns ok', async () => {
    const res = await healthHandler();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('login returns access token', async () => {
    const req = makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner@demo.okauto.local', password: 'Demo1234!' }),
    });
    const res = await loginHandler(req as never);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.accessToken).toBeTruthy();
    accessToken = data.accessToken;
  });

  it('lists vehicles for authenticated user', async () => {
    const req = makeRequest('http://localhost/api/v1/vehicles', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const res = await vehiclesHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.vehicles)).toBe(true);
  });

  it('returns dashboard analytics', async () => {
    const req = makeRequest('http://localhost/api/v1/analytics/dashboard', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const res = await dashboardHandler(req, { params: Promise.resolve({}) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.totalVehicles).toBe('number');
    expect(Array.isArray(data.memberStats)).toBe(true);
  });

  it('rejects unauthenticated vehicle requests', async () => {
    const req = makeRequest('http://localhost/api/v1/vehicles');
    const res = await vehiclesHandler(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
});
