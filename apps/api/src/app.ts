import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/client.js";
import { ApiError } from "./lib/errors.js";
import { verifyAccessToken } from "./lib/tokens.js";
import { adminRoutes } from "./modules/admin.js";
import { analyticsRoutes } from "./modules/analytics.js";
import { auditRoutes } from "./modules/audit.js";
import { authRoutes } from "./modules/auth.js";
import { healthRoutes } from "./modules/health.js";
import { importRoutes } from "./modules/imports.js";
import { listingRoutes } from "./modules/listings.js";
import { notificationRoutes } from "./modules/notifications.js";
import { orgRoutes } from "./modules/orgs.js";
import { vehicleRoutes } from "./modules/vehicles.js";
import type { AiService } from "./services/ai.js";
import type { VinDecoderFn } from "./services/vinDecoder.js";

export interface AppContext {
  config: AppConfig;
  db: Db;
  ai: AiService;
  decodeVin: VinDecoderFn;
  fetchImpl: typeof fetch;
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.NODE_ENV === "test" ? false : { level: ctx.config.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 20 * 1024 * 1024, // CSV imports can be large
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser clients (curl, extension service worker fetch) send no origin.
      if (!origin) return cb(null, true);
      const allowed = ctx.config.CORS_ORIGINS.split(",").map((o) => o.trim());
      if (allowed.includes(origin) || origin.startsWith("chrome-extension://")) {
        return cb(null, true);
      }
      return cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: ctx.config.RATE_LIMIT_MAX,
    timeWindow: ctx.config.RATE_LIMIT_WINDOW_MS,
    allowList: ctx.config.NODE_ENV === "test" ? ["127.0.0.1"] : [],
  });

  // Decode the access token (if present) for every request.
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      request.auth = await verifyAccessToken(header.slice(7), ctx.config.JWT_SECRET);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (typeof err.statusCode === "number" && err.statusCode < 500) {
      return reply.status(err.statusCode).send({
        error: { code: err.code ?? "REQUEST_ERROR", message: err.message ?? "Request error" },
      });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  });

  await app.register(healthRoutes(ctx));
  await app.register(authRoutes(ctx), { prefix: "/api/v1" });
  await app.register(orgRoutes(ctx), { prefix: "/api/v1" });
  await app.register(vehicleRoutes(ctx), { prefix: "/api/v1" });
  await app.register(importRoutes(ctx), { prefix: "/api/v1" });
  await app.register(listingRoutes(ctx), { prefix: "/api/v1" });
  await app.register(notificationRoutes(ctx), { prefix: "/api/v1" });
  await app.register(analyticsRoutes(ctx), { prefix: "/api/v1" });
  await app.register(auditRoutes(ctx), { prefix: "/api/v1" });
  await app.register(adminRoutes(ctx), { prefix: "/api/v1" });

  return app;
}
