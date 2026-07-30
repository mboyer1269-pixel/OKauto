/** Centralized environment access with sane defaults for local/dev/CI. */

function get(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: get('DATABASE_URL'),
  authSecret: get('AUTH_SECRET', 'dev-insecure-secret-change-me-please-32chars'),
  sessionTtl: Number.parseInt(get('AUTH_SESSION_TTL', '604800'), 10),
  appUrl: get('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  aiProvider: get('AI_PROVIDER'),
  openaiApiKey: get('OPENAI_API_KEY'),
  openaiModel: get('OPENAI_MODEL', 'gpt-4o-mini'),
  mediaStorage: get('MEDIA_STORAGE', 'local'),
  logLevel: get('LOG_LEVEL', 'info'),
  workerPollIntervalMs: Number.parseInt(get('WORKER_POLL_INTERVAL_MS', '2000'), 10),
  isProduction: get('NODE_ENV') === 'production',
};

export function assertProductionSecrets(): void {
  if (env.isProduction && env.authSecret.startsWith('dev-insecure')) {
    throw new Error('AUTH_SECRET must be set to a strong value in production.');
  }
}
