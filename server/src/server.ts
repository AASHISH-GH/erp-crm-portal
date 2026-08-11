import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

// Close in-flight requests and release the DB pool before the platform SIGKILLs us,
// which prevents dropped connections during a redeploy.
const shutdown = async (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
