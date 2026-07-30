import { describe, expect, it, beforeAll } from 'vitest';
import { loadEnv } from './config.js';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

describe('API integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://okauto:okauto@localhost:5432/okauto?schema=public';
    process.env.JWT_ACCESS_SECRET ??= 'dev-access-secret-change-me-in-production-32chars';
    process.env.JWT_REFRESH_SECRET ??= 'dev-refresh-secret-change-me-in-production-32chars';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.AI_ENABLED = 'false';
    const env = loadEnv();
    app = await buildApp(env);
    await app.ready();
  });

  it('health ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('login and list vehicles', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'owner@okauto.demo', password: 'Password123!' },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken } = login.json();
    const vehicles = await app.inject({
      method: 'GET',
      url: '/v1/vehicles',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(vehicles.statusCode).toBe(200);
    expect(vehicles.json().total).toBeGreaterThan(0);
  });
});
