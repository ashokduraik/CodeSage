import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type AppConfig } from "../platform/config";
import { buildLoggerOptions } from "../platform/logger";
import { registerErrorHandler } from "../platform/errors";
import { healthRoutes } from "../modules/health/health.routes";

/**
 * Builds and configures the Fastify application instance.
 * Registers all platform concerns (error handling, structured logging) and domain routes.
 * Does not start listening — call `.listen()` on the returned instance (see `index.ts`).
 * @param config - Application configuration; defaults to reading from environment variables.
 * @returns A configured, ready-to-listen Fastify instance.
 */
export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(config) });
  registerErrorHandler(app);
  app.register(healthRoutes);
  return app;
}
