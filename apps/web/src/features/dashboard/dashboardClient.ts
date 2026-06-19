import { apiFetch } from "@/shared/lib/apiClient";
import type { NodeApi } from "@codesage/shared-types";

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/**
 * Fetches aggregate dashboard statistics from the Node API.
 * @returns Dashboard stat counters.
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/dashboard/stats");
}

/**
 * Fetches recent chat sessions for the dashboard overview panel.
 * @returns Array of recent chat sessions (may be empty when sessions are not yet implemented).
 */
export async function fetchDashboardSessions(): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>("/dashboard/sessions");
}
