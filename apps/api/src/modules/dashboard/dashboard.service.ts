import type { Sql } from "../../platform/db";
import { getProjectCounts } from "./dashboard.repository";
import { countAllKnowledgeEntries } from "../knowledge/knowledge.repository";
import { MOCK_SESSIONS, MOCK_STATS } from "../../platform/mock-data";
import type { NodeApi } from "@codesage/shared-types";
import {
  countConversationsByUser,
  findRecentConversationsByUser,
  type ConversationRow,
} from "../chat/chat.repository";

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];
type ChatMode = NodeApi.components["schemas"]["ChatMode"];

const DEFAULT_TITLE = "New Chat";
const DASHBOARD_SESSION_LIMIT = 5;

/**
 * Maps a conversation row to the dashboard ChatSession shape.
 *
 * @param row - Database conversation row with aggregates.
 * @returns ChatSession response object.
 */
function toChatSession(row: ConversationRow): ChatSession {
  return {
    id: row.id,
    title: row.title?.trim() || DEFAULT_TITLE,
    mode: row.audience as ChatMode,
    projectId: row.project_id,
    projectName: row.project_name,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
  };
}

/**
 * Returns aggregate dashboard statistics.
 *
 * In mock mode, returns the static {@link MOCK_STATS} dataset.
 * In normal mode, computes counts from the database for the authenticated user.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Authenticated user UUID.
 * @param mockMode - When true, bypass the database and return static mock data.
 * @returns {@link DashboardStats} populated from the database or mock dataset.
 */
export async function getDashboardStats(
  db: Sql,
  userId: string,
  mockMode: boolean,
): Promise<DashboardStats> {
  if (mockMode) {
    return { ...MOCK_STATS };
  }

  const counts = await getProjectCounts(db);
  const sessionCount = await countConversationsByUser(db, userId);
  const knowledgeCount = await countAllKnowledgeEntries(db);
  return {
    projectCount: counts.projectCount,
    indexedProjectCount: counts.indexedProjectCount,
    sessionCount,
    knowledgeCount,
    pendingReviewCount: 0,
  };
}

/**
 * Returns recent chat sessions for the dashboard overview.
 *
 * In mock mode, returns the static {@link MOCK_SESSIONS} dataset.
 * In normal mode, returns the user's most recent conversations.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Authenticated user UUID.
 * @param mockMode - When true, return static mock sessions.
 * @returns Array of {@link ChatSession} objects.
 */
export async function listDashboardSessions(
  db: Sql,
  userId: string,
  mockMode: boolean,
): Promise<ChatSession[]> {
  if (mockMode) {
    return MOCK_SESSIONS as ChatSession[];
  }
  const rows = await findRecentConversationsByUser(db, userId, DASHBOARD_SESSION_LIMIT);
  return rows.map(toChatSession);
}
