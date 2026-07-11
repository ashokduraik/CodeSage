import type { FastifyInstance } from "fastify";
import { getDashboardStats, listDashboardSessions } from "./dashboard.service";
import type { NodeApi } from "@codesage/shared-types";
import type { JwtPayload } from "../../platform/auth.plugin";

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
  app.get<{ Reply: DashboardStats }>("/dashboard/stats", async (request) => {
    const { sub } = request.user as JwtPayload;
    return getDashboardStats(app.db, sub, app.config.mockMode);
  });

  app.get<{ Reply: ChatSession[] }>("/dashboard/sessions", async (request) => {
    const { sub } = request.user as JwtPayload;
    return listDashboardSessions(app.db, sub, app.config.mockMode);
  });
}
