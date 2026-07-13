import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { registerAuthMiddleware } from "../platform/auth.middleware";
import { healthRoutes } from "../modules/health/health.routes";
import { authRoutes } from "../modules/auth";
import { usersRoutes } from "../modules/users";
import { projectsRoutes } from "../modules/projects";
import { reposRoutes } from "../modules/repos";
import { webhooksRoutes } from "../modules/webhooks";
import { dashboardRoutes } from "../modules/dashboard";
import { knowledgeRoutes } from "../modules/knowledge";
import { chatRoutes } from "../modules/chat";
import { auditRoutes } from "../modules/audit";

/** Domain route plugins registered in dependency order (health first for liveness). */
const ROUTE_PLUGINS: FastifyPluginAsync[] = [
  healthRoutes,
  authRoutes,
  usersRoutes,
  auditRoutes,
  projectsRoutes,
  reposRoutes,
  webhooksRoutes,
  dashboardRoutes,
  knowledgeRoutes,
  chatRoutes,
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
