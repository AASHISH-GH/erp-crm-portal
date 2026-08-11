import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp();

// Bind to 0.0.0.0, not the default. Container platforms (Render, Railway, Fly, ECS)
// route traffic to the container's external interface; a process listening only on
// localhost accepts the TCP connection at the edge and then never answers, which
// presents as a request that hangs rather than a clean error.
const HOST = '0.0.0.0';

const server = app.listen(env.PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on ${HOST}:${env.PORT} [${env.NODE_ENV}]`);
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
