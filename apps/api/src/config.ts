import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("postgres://openlot:openlot@localhost:5432/openlot"),
  /** HS256 secret for access tokens. MUST be overridden in production. */
  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  /** Comma-separated list of allowed CORS origins (web dashboard + extension). */
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z
    .string()
    .default("auto")
    .transform((v) => (v === "auto" ? undefined : v === "true")),
  /** Run the background worker loop inside the API process (single-node deploys/dev). */
  WORKER_INLINE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().default(2000),
  /** Optional OpenAI-compatible endpoint for AI descriptions. */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /** Enable calling the public NHTSA vPIC decoder for VIN enrichment. */
  ENABLE_NHTSA_DECODER: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  RATE_LIMIT_MAX: z.coerce.number().int().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === "production" && config.JWT_SECRET === "dev-only-secret-change-me-please") {
    throw new Error("JWT_SECRET must be set to a strong secret in production");
  }
  return config;
}
