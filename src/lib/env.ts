import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_PEPPER: z.string().min(32),
  IP_HASH_KEY: z.string().min(32),
  AI_BASE_URL: z.url().optional().or(z.literal("")),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  EXTENSION_ORIGINS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | undefined;

export function env(): AppEnv {
  cached ??= schema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
