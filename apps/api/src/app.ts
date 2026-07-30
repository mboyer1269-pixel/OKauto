import crypto from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { loadEnv, type Env } from "./lib/env.js";
import { authRoutes } from "./routes/auth.js";
import { orgRoutes } from "./routes/orgs.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { listingRoutes } from "./routes/listings.js";
import {
  analyticsRoutes,
  auditRoutes,
  notificationRoutes,
} from "./routes/analytics.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}

export async function buildApp(env: Env = loadEnv()) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino/file", options: { destination: 1 } }
          : undefined,
    },
    genReqId: (req) =>
      (req.headers["x-request-id"] as string) || crypto.randomUUID(),
  });

  app.decorate("env", env);

  app.addHook("onRequest", async (request) => {
    request.requestId = request.id;
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  const origins = env.CORS_ORIGINS.split(",").map((s) => s.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origins.includes("*")) return cb(null, true);
      if (origins.some((o) => o === origin || (o.endsWith("*") && origin.startsWith(o.slice(0, -1))))) {
        return cb(null, true);
      }
      if (origin.startsWith("chrome-extension://")) return cb(null, true);
      if (origins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.flatten(),
        requestId: request.id,
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    request.log.error({ err, requestId: request.id }, "request error");
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return reply.code(status).send({
      error: status >= 500 ? "Internal server error" : message,
      code: (err as { code?: string }).code,
      requestId: request.id,
    });
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "okauto-api",
    ts: new Date().toISOString(),
  }));

  app.get("/v1/ready", async (_request, reply) => {
    try {
      const { prisma } = await import("@okauto/db");
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return reply.code(503).send({
        ok: false,
        error: err instanceof Error ? err.message : "not ready",
      });
    }
  });

  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(vehicleRoutes);
  await app.register(listingRoutes);
  await app.register(analyticsRoutes);
  await app.register(notificationRoutes);
  await app.register(auditRoutes);

  return app;
}

export async function start() {
  const env = loadEnv();
  const app = await buildApp(env);
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`OKauto API listening on ${env.API_HOST}:${env.API_PORT}`);
  return app;
}
