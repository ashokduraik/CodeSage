import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { loadConfig, type AppConfig } from "../platform/config";
import { buildLoggerOptions } from "../platform/logger";
import { registerErrorHandler } from "../platform/errors";
import { createDbClient, type Sql } from "../platform/db";
import { healthRoutes } from "../modules/health/health.routes";
import { authRoutes } from "../modules/auth";
import { usersRoutes } from "../modules/users";
import { projectsRoutes } from "../modules/projects";
import { reposRoutes } from "../modules/repos";

/**
 * Extends the Fastify instance type so all route handlers can access `app.db`
 * and `app.config` without unsafe casts.
 */
declare module "fastify" {
  interface FastifyInstance {
    /** Shared postgres.js connection pool. Available to all route handlers. */
    db: Sql;
    /** Resolved application configuration, decorated at startup. */
    config: AppConfig;
  }
}

/**
 * Builds and configures the Fastify application instance.
 * Registers all platform concerns (DB pool, JWT plugin, error handling, structured
 * logging) and domain routes. Does not start listening — call `.listen()` on the
 * returned instance (see `index.ts`).
 * @param config - Application configuration; defaults to reading from environment variables.
 * @returns A configured, ready-to-listen Fastify instance.
 */
export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(config) });

  app.decorate("config", config);

  const db = createDbClient(config.databaseUrl);
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    await db.end();
  });

  // JWT plugin: signs and verifies tokens; augments FastifyRequest with jwtVerify().
  app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtTtl },
  });

  registerErrorHandler(app);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(usersRoutes);
  app.register(projectsRoutes);
  app.register(reposRoutes);

  return app;
}
