import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type AppConfig } from "../platform/config";
import { healthRoutes } from "../modules/health/health.routes";

export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({ logger: config.logger });
  app.register(healthRoutes);
  return app;
}
