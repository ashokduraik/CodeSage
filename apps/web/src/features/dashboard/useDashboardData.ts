import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  listProjects,
  listSessions,
  type ChatSession,
  type DashboardStats,
  type Project,
} from "@/shared/mock";

/** Stable query key for the aggregated dashboard data. */
export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

/** Shape returned by {@link useDashboardData}. */
export interface DashboardData {
  projects: Project[];
  sessions: ChatSession[];
  stats: DashboardStats;
}

/**
 * Loads the dashboard's projects, sessions and aggregate stats in one query.
 * Backed by the temporary mock layer; swap the queryFn for the typed API client
 * once the Node contract exposes these endpoints.
 * @returns The TanStack Query result for {@link DashboardData}.
 */
export function useDashboardData() {
  return useQuery<DashboardData, Error>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const [projects, sessions, stats] = await Promise.all([
        listProjects(),
        listSessions(),
        getDashboardStats(),
      ]);
      return { projects, sessions, stats };
    },
  });
}
