import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';
import type { Env } from './config.js';
import { authRoutes } from './routes/auth.js';
import { inventorySourceRoutes, listingRoutes, vehicleRoutes } from './routes/vehicles.js';
import { orgRoutes } from './routes/org.js';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      base: { service: 'okauto-api' },
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Attach env to every request
  app.decorate('env', env);
  app.addHook('onRequest', async (request) => {
    request.env = env;
  });

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed = env.CORS_ORIGINS.split(',').map((s) => s.trim());
      if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
      if (origin.startsWith('chrome-extension://') && allowed.some((a) => a.includes('chrome-extension'))) {
        return cb(null, true);
      }
      // Dev: allow localhost
      if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          details: err.flatten(),
        },
      });
    }
    request.log.error({ err }, 'request error');
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Request failed';
    return reply.code(status).send({
      error: {
        code: status >= 500 ? 'internal_error' : 'request_error',
        message: status >= 500 ? 'Internal server error' : message,
      },
    });
  });

  app.get('/v1/health', async () => ({
    ok: true,
    service: 'okauto-api',
    time: new Date().toISOString(),
    aiEnabled: Boolean(env.AI_ENABLED && env.OPENAI_API_KEY),
  }));

  app.get('/v1/metrics', async () => {
    // Lightweight process metrics for MVP observability
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round(process.uptime()),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
      },
      node: process.version,
    };
  });

  await app.register(authRoutes);
  await app.register(vehicleRoutes);
  await app.register(listingRoutes);
  await app.register(inventorySourceRoutes);
  await app.register(orgRoutes);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
  }
}
