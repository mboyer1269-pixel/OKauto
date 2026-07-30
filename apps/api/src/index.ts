import 'dotenv/config';
import { loadEnv } from './config.js';
import { buildApp } from './app.js';
import { prisma } from './db.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp(env);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`OKauto API listening on ${env.API_HOST}:${env.API_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
