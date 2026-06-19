import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { fetchProjects } from "@/features/projects/projectsClient";
import { fetchDashboardStats, fetchDashboardSessions } from "./dashboardClient";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];
type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/** Stable query key for the aggregated dashboard data. */
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

/** Shape returned by {@link useDashboardData}. */
export interface DashboardData {
  projects: Project[];
  sessions: ChatSession[];
  stats: DashboardStats;
}

/**
 * Loads the dashboard's projects, sessions and aggregate stats in one React Query entry.
 *
 * Calls three API endpoints in parallel:
 *   - `GET /projects` — list of projects with repo counts.
 *   - `GET /dashboard/stats` — aggregate counters.
 *   - `GET /dashboard/sessions` — recent chat sessions.
 *
 * The query is disabled when there is no JWT token (unauthenticated state).
 *
 * @returns The TanStack Query result for {@link DashboardData}.
 */
export function useDashboardData() {
  const { user } = useAuth();

  return useQuery<DashboardData, Error>({
    queryKey: DASHBOARD_QUERY_KEY,
    enabled: Boolean(user),
    queryFn: async () => {
      const [projects, stats, sessions] = await Promise.all([
        fetchProjects(),
        fetchDashboardStats(),
        fetchDashboardSessions(),
      ]);
      return { projects, stats, sessions };
    },
  });
}
