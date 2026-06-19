import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { registerAuthMiddleware } from "../platform/auth.middleware";
import { healthRoutes } from "../modules/health/health.routes";
import { authRoutes } from "../modules/auth";
import { usersRoutes } from "../modules/users";
import { projectsRoutes } from "../modules/projects";
import { reposRoutes } from "../modules/repos";
import { dashboardRoutes } from "../modules/dashboard";

/** Domain route plugins registered in dependency order (health first for liveness). */
const ROUTE_PLUGINS: FastifyPluginAsync[] = [
  healthRoutes,
  authRoutes,
  usersRoutes,
  projectsRoutes,
  reposRoutes,
  dashboardRoutes,
];

/**
 * Fastify plugin that registers every domain route module.
 * All routes are mounted under the `/api` prefix (see `http/app.ts`).
 * @param app - The Fastify application instance.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  registerAuthMiddleware(app);

  for (const plugin of ROUTE_PLUGINS) {
    await app.register(plugin);
  }
}
