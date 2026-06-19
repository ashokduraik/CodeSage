import type { Sql } from "../../platform/db";
import { getProjectCounts } from "./dashboard.repository";
import { MOCK_SESSIONS, MOCK_STATS } from "../../platform/mock-data";
import type { NodeApi } from "@codesage/shared-types";

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/**
 * Returns aggregate dashboard statistics.
 *
 * In mock mode, returns the static {@link MOCK_STATS} dataset.
 * In normal mode, computes counts from the database; fields backed by tables
 * that do not yet exist (sessions, knowledge, reviews) are returned as 0.
 *
 * @param db - The postgres.js SQL client.
 * @param mockMode - When true, bypass the database and return static mock data.
 * @returns {@link DashboardStats} populated from the database or mock dataset.
 */
export async function getDashboardStats(db: Sql, mockMode: boolean): Promise<DashboardStats> {
  if (mockMode) {
    return { ...MOCK_STATS };
  }

  const counts = await getProjectCounts(db);
  return {
    projectCount: counts.projectCount,
    indexedProjectCount: counts.indexedProjectCount,
    sessionCount: 0,
    knowledgeCount: 0,
    pendingReviewCount: 0,
  };
}

/**
 * Returns recent chat sessions for the dashboard overview.
 *
 * In mock mode, returns the static {@link MOCK_SESSIONS} dataset.
 * In normal mode, returns an empty array until the sessions table is implemented.
 *
 * @param _db - The postgres.js SQL client (unused until sessions table exists).
 * @param mockMode - When true, return static mock sessions.
 * @returns Array of {@link ChatSession} objects.
 */
export async function listDashboardSessions(
  _db: Sql,
  mockMode: boolean,
): Promise<ChatSession[]> {
  if (mockMode) {
    return MOCK_SESSIONS as ChatSession[];
  }
  return [];
}
