import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { createPrismaClient, type PrismaClient } from "@okauto/db";
import { API_PREFIX } from "@okauto/shared";
import type { AppConfig } from "./config.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./modules/auth/routes.js";
import orgRoutes from "./modules/orgs/routes.js";
import memberRoutes from "./modules/members/routes.js";
import vehicleRoutes from "./modules/vehicles/routes.js";
import importRoutes from "./modules/imports/routes.js";
import listingRoutes from "./modules/listings/routes.js";
import descriptionRoutes from "./modules/descriptions/routes.js";
import notificationRoutes from "./modules/notifications/routes.js";
import analyticsRoutes from "./modules/analytics/routes.js";
import extensionRoutes from "./modules/extension/routes.js";
import adminRoutes from "./modules/admin/routes.js";
import { PgJobQueue } from "./jobs/queue.js";
import { JobWorker } from "./jobs/worker.js";
import { buildJobHandlers } from "./jobs/handlers/index.js";
import { notificationHub } from "./modules/notifications/hub.js";
import { createEmailTransport } from "./services/email.js";
import { renderMetrics } from "./lib/metrics.js";

export interface BuildServerOptions {
  config: AppConfig;
  prisma?: PrismaClient;
  startWorker?: boolean;
}

export interface BuiltServer {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: PgJobQueue;
  worker: JobWorker | null;
}

export async function buildServer(options: BuildServerOptions): Promise<BuiltServer> {
  const { config } = options;
  const isProd = config.NODE_ENV === "production";
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : isProd ? "info" : "debug",
    },
    genReqId: () => randomUUID(),
    trustProxy: true,
    disableRequestLogging: config.NODE_ENV === "test",
  });

  const prisma = options.prisma ?? createPrismaClient({ datasourceUrl: config.DATABASE_URL });
  const workerId = config.JOB_WORKER_ID || `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const queue = new PgJobQueue(prisma, { workerId, lockTtlMs: config.JOB_LOCK_TTL_MS });

  app.decorate("prisma", prisma);
  app.decorate("config", config);
  app.decorate("jobQueue", queue);

  const allowedOrigins = new Set(config.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean));
  await app.register(cors, {
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / server-to-server
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (origin.startsWith("chrome-extension://")) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
  });

  app.get("/healthz", async () => ({ ok: true, uptime: process.uptime() }));
  app.get("/readyz", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4");
    return renderMetrics();
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(orgRoutes);
      await api.register(memberRoutes);
      await api.register(vehicleRoutes);
      await api.register(importRoutes);
      await api.register(listingRoutes);
      await api.register(descriptionRoutes);
      await api.register(notificationRoutes);
      await api.register(analyticsRoutes);
      await api.register(extensionRoutes);
      await api.register(adminRoutes);
    },
    { prefix: API_PREFIX },
  );

  let worker: JobWorker | null = null;
  const shouldRunWorker = options.startWorker ?? config.RUN_WORKER;
  if (shouldRunWorker) {
    const handlers = buildJobHandlers({
      db: prisma,
      queue,
      config,
      hub: notificationHub,
      email: createEmailTransport(config),
    });
    worker = new JobWorker(queue, handlers, {
      pollMs: config.JOB_QUEUE_POLL_MS,
      concurrency: config.JOB_CONCURRENCY,
      logger: {
        info: (obj, msg) => app.log.info(obj, msg),
        error: (obj, msg) => app.log.error(obj, msg),
      },
    });
    worker.start();

    const sweepTimer = setInterval(() => {
      const bucket = Math.floor(Date.now() / config.SYNC_SWEEP_INTERVAL_MS);
      queue
        .enqueue("SYNC_SWEEP", {}, { dedupeKey: `sweep:${bucket}` })
        .catch((err) => app.log.error({ err }, "failed to enqueue sync sweep"));
    }, config.SYNC_SWEEP_INTERVAL_MS);

    app.addHook("onClose", async () => {
      clearInterval(sweepTimer);
      await worker?.stop();
    });
  }

  app.addHook("onClose", async () => {
    if (!options.prisma) await prisma.$disconnect();
  });

  return { app, prisma, queue, worker };
}
