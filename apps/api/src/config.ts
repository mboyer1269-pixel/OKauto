import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(16),
  REFRESH_COOKIE_NAME: z.string().default("okauto_rt"),
  VIN_PROVIDER: z.enum(["local", "vpic"]).default("local"),
  DESCRIPTION_PROVIDER: z.enum(["template", "openai"]).default("template"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  EMAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  SMTP_URL: z.string().default(""),
  IMPORT_HTTP_TIMEOUT_MS: z.coerce.number().int().default(15000),
  IMPORT_MAX_PHOTOS: z.coerce.number().int().default(40),
  SYNC_SWEEP_INTERVAL_MS: z.coerce.number().int().default(60000),
  JOB_QUEUE_POLL_MS: z.coerce.number().int().default(1000),
  JOB_WORKER_ID: z.string().default(""),
  JOB_LOCK_TTL_MS: z.coerce.number().int().default(5 * 60 * 1000),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  RUN_WORKER: z.coerce.boolean().default(true),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}
