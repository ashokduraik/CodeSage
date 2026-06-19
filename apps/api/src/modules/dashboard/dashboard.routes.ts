import type { FastifyInstance } from "fastify";
import { getDashboardStats, listDashboardSessions } from "./dashboard.service";
import type { NodeApi } from "@codesage/shared-types";

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/**
 * Fastify plugin that registers dashboard aggregate routes.
 *
 * JWT authentication is enforced by the global auth middleware in `platform/auth.middleware.ts`.
 * When {@link AppConfig.mockMode} is enabled they return static mock data instead of querying
 * the database.
 *
 * Routes:
 * - `GET /dashboard/stats` — aggregate dashboard counters.
 * - `GET /dashboard/sessions` — recent chat sessions for the overview panel.
 *
 * @param app - The Fastify application instance.
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: DashboardStats }>("/dashboard/stats", async () => {
    return getDashboardStats(app.db, app.config.mockMode);
  });

  app.get<{ Reply: ChatSession[] }>("/dashboard/sessions", async () => {
    return listDashboardSessions(app.db, app.config.mockMode);
  });
}
