import "fastify";
import type { PrismaClient } from "@okauto/db";
import type { AppConfig } from "./config.js";
import type { PgJobQueue } from "./jobs/queue.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
    jobQueue: PgJobQueue;
  }
}
