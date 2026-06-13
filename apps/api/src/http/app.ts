import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type AppConfig } from "../platform/config";
import { buildLoggerOptions } from "../platform/logger";
import { registerErrorHandler } from "../platform/errors";
import { createDbClient, type Sql } from "../platform/db";
import { healthRoutes } from "../modules/health/health.routes";

/**
 * Extends the Fastify instance type so all route handlers can access `app.db`
 * without unsafe casts.
 */
declare module "fastify" {
  interface FastifyInstance {
    /** Shared postgres.js connection pool. Available to all route handlers. */
    db: Sql;
  }
}

/**
 * Builds and configures the Fastify application instance.
 * Registers all platform concerns (DB pool, error handling, structured logging)
 * and domain routes. Does not start listening — call `.listen()` on the returned
 * instance (see `index.ts`).
 * @param config - Application configuration; defaults to reading from environment variables.
 * @returns A configured, ready-to-listen Fastify instance.
 */
export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(config) });

  const db = createDbClient(config.databaseUrl);
  app.decorate('db', db);
  // Release all pool connections when the server shuts down.
  app.addHook('onClose', async () => {
    await db.end();
  });

  registerErrorHandler(app);
  app.register(healthRoutes);
  return app;
}
