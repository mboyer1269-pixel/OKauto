import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

export type PrismaLike = PrismaClient;

export interface CreateClientOptions {
  datasourceUrl?: string;
  log?: ("query" | "info" | "warn" | "error")[];
}

export function createPrismaClient(options: CreateClientOptions = {}): PrismaClient {
  return new PrismaClient({
    ...(options.datasourceUrl ? { datasourceUrl: options.datasourceUrl } : {}),
    log: options.log ?? ["warn", "error"],
  });
}
