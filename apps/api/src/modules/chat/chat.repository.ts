import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Row shape returned from the `conversations` table with aggregates. */
export interface ConversationRow {
  id: string;
  project_id: string;
  user_id: string;
  audience: string;
  title: string | null;
  project_name: string | null;
  message_count: number;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Row shape returned from the `messages` table. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations: unknown;
  metrics: unknown;
  needs_review: boolean;
  stopped: boolean;
  created_at: Date;
}

/** Conversation scope fields needed for RAG proxying. */
export interface ConversationScopeRow {
  id: string;
  project_id: string;
  user_id: string;
  audience: string;
  title: string | null;
}

/**
 * Inserts a new conversation row owned by the given user.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID scope.
 * @param audience - Chat mode (`developer` or `end_user`).
 * @param actorId - Authenticated user UUID.
 * @returns The created conversation row with aggregates.
 */
export async function insertConversation(
  db: Sql,
  projectId: string,
  audience: string,
  actorId: string,
): Promise<ConversationRow> {
  const rows = await db<ConversationRow[]>`
    INSERT INTO conversations (project_id, user_id, audience, created_by, updated_by)
    VALUES (${projectId}, ${actorId}, ${audience}, ${actorId}, ${actorId})
    RETURNING
      id,
      project_id,
      user_id,
      audience,
      title,
      NULL::text AS project_name,
      0::int AS message_count,
      NULL::timestamptz AS last_message_at,
      created_at,
      updated_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from conversation INSERT.");
  }
  return row;
}

/**
 * Lists active conversations for a user, newest activity first.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Owner user UUID.
 * @returns Conversations with message counts and project display names.
 */
export async function findConversationsByUser(db: Sql, userId: string): Promise<ConversationRow[]> {
  return db<ConversationRow[]>`
    SELECT
      c.id,
      c.project_id,
      c.user_id,
      c.audience,
      c.title,
      p.name AS project_name,
      COUNT(m.id)::int AS message_count,
      MAX(m.created_at) AS last_message_at,
      c.created_at,
      c.updated_at
    FROM conversations c
    LEFT JOIN projects p ON p.id = c.project_id AND p.status = ${ROW_STATUS.ACTIVE}
    LEFT JOIN messages m ON m.conversation_id = c.id AND m.status = ${ROW_STATUS.ACTIVE}
    WHERE c.user_id = ${userId}
      AND c.status = ${ROW_STATUS.ACTIVE}
    GROUP BY c.id, p.name
    ORDER BY COALESCE(MAX(m.created_at), c.updated_at) DESC
  `;
}

/**
 * Returns recent conversations for the dashboard overview panel.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Owner user UUID.
 * @param limit - Maximum sessions to return.
 * @returns Recent conversations with aggregates.
 */
export async function findRecentConversationsByUser(
  db: Sql,
  userId: string,
  limit: number,
): Promise<ConversationRow[]> {
  return db<ConversationRow[]>`
    SELECT
      c.id,
      c.project_id,
      c.user_id,
      c.audience,
      c.title,
      p.name AS project_name,
      COUNT(m.id)::int AS message_count,
      MAX(m.created_at) AS last_message_at,
      c.created_at,
      c.updated_at
    FROM conversations c
    LEFT JOIN projects p ON p.id = c.project_id AND p.status = ${ROW_STATUS.ACTIVE}
    LEFT JOIN messages m ON m.conversation_id = c.id AND m.status = ${ROW_STATUS.ACTIVE}
    WHERE c.user_id = ${userId}
      AND c.status = ${ROW_STATUS.ACTIVE}
    GROUP BY c.id, p.name
    ORDER BY COALESCE(MAX(m.created_at), c.updated_at) DESC
    LIMIT ${limit}
  `;
}

/**
 * Finds one active conversation owned by the given user.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @returns The conversation row or `undefined` when not found.
 */
export async function findConversationByIdForUser(
  db: Sql,
  conversationId: string,
  userId: string,
): Promise<ConversationRow | undefined> {
  const rows = await db<ConversationRow[]>`
    SELECT
      c.id,
      c.project_id,
      c.user_id,
      c.audience,
      c.title,
      p.name AS project_name,
      COUNT(m.id)::int AS message_count,
      MAX(m.created_at) AS last_message_at,
      c.created_at,
      c.updated_at
    FROM conversations c
    LEFT JOIN projects p ON p.id = c.project_id AND p.status = ${ROW_STATUS.ACTIVE}
    LEFT JOIN messages m ON m.conversation_id = c.id AND m.status = ${ROW_STATUS.ACTIVE}
    WHERE c.id = ${conversationId}
      AND c.user_id = ${userId}
      AND c.status = ${ROW_STATUS.ACTIVE}
    GROUP BY c.id, p.name
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Loads conversation scope fields for authorization and RAG proxying.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @returns Scope row or `undefined` when not found or not owned.
 */
export async function findConversationScopeForUser(
  db: Sql,
  conversationId: string,
  userId: string,
): Promise<ConversationScopeRow | undefined> {
  const rows = await db<ConversationScopeRow[]>`
    SELECT id, project_id, user_id, audience, title
    FROM conversations
    WHERE id = ${conversationId}
      AND user_id = ${userId}
      AND status = ${ROW_STATUS.ACTIVE}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Soft-deletes a conversation owned by the given user.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @param actorId - Authenticated user UUID for audit columns.
 * @returns `true` when a row was soft-deleted.
 */
export async function softDeleteConversation(
  db: Sql,
  conversationId: string,
  userId: string,
  actorId: string,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    UPDATE conversations
    SET status = ${ROW_STATUS.DELETED},
        updated_by = ${actorId}
    WHERE id = ${conversationId}
      AND user_id = ${userId}
      AND status = ${ROW_STATUS.ACTIVE}
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Updates the display title of an active conversation.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param title - New title text.
 * @param actorId - Authenticated user UUID for audit columns.
 */
export async function updateConversationTitle(
  db: Sql,
  conversationId: string,
  title: string,
  actorId: string,
): Promise<void> {
  await db`
    UPDATE conversations
    SET title = ${title},
        updated_by = ${actorId}
    WHERE id = ${conversationId}
      AND status = ${ROW_STATUS.ACTIVE}
  `;
}

/**
 * Inserts one message turn and bumps the parent conversation `updated_at`.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Parent conversation UUID.
 * @param role - Message role (`user`, `assistant`, or `system`).
 * @param content - Message body.
 * @param actorId - Authenticated user UUID for audit columns.
 * @param options - Optional citations, metrics, and flags for assistant turns.
 * @returns The stored message row.
 */
export async function insertMessage(
  db: Sql,
  conversationId: string,
  role: string,
  content: string,
  actorId: string,
  options?: {
    citations?: unknown;
    metrics?: unknown;
    needsReview?: boolean;
    stopped?: boolean;
  },
): Promise<MessageRow> {
  const citations = options?.citations ?? null;
  const metrics = options?.metrics ?? null;
  const needsReview = options?.needsReview ?? false;
  const stopped = options?.stopped ?? false;

  const rows = await db<MessageRow[]>`
    INSERT INTO messages (
      conversation_id,
      role,
      content,
      citations,
      metrics,
      needs_review,
      stopped,
      created_by,
      updated_by
    )
    VALUES (
      ${conversationId},
      ${role},
      ${content},
      ${citations !== null ? db.json(citations as never) : null},
      ${metrics !== null ? db.json(metrics as never) : null},
      ${needsReview},
      ${stopped},
      ${actorId},
      ${actorId}
    )
    RETURNING
      id,
      conversation_id,
      role,
      content,
      citations,
      metrics,
      needs_review,
      stopped,
      created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from message INSERT.");
  }

  await db`
    UPDATE conversations
    SET updated_at = now(),
        updated_by = ${actorId}
    WHERE id = ${conversationId}
      AND status = ${ROW_STATUS.ACTIVE}
  `;

  return row;
}

/**
 * Returns active messages for a conversation in chronological order.
 * Omits empty assistant rows (e.g. citation-only aborts) so they never appear
 * in the UI or in RAG history built from this list.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Parent conversation UUID.
 * @returns Message rows oldest-first.
 */
export async function findMessagesByConversation(
  db: Sql,
  conversationId: string,
): Promise<MessageRow[]> {
  return db<MessageRow[]>`
    SELECT
      id,
      conversation_id,
      role,
      content,
      citations,
      metrics,
      needs_review,
      stopped,
      created_at
    FROM messages
    WHERE conversation_id = ${conversationId}
      AND status = ${ROW_STATUS.ACTIVE}
      AND NOT (role = 'assistant' AND btrim(content) = '')
    ORDER BY created_at ASC
  `;
}

/**
 * Counts active messages in a conversation.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Parent conversation UUID.
 * @returns Number of stored message turns.
 */
export async function countMessagesByConversation(db: Sql, conversationId: string): Promise<number> {
  const rows = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM messages
    WHERE conversation_id = ${conversationId}
      AND status = ${ROW_STATUS.ACTIVE}
      AND NOT (role = 'assistant' AND btrim(content) = '')
  `;
  return rows[0]?.count ?? 0;
}

/**
 * Counts active conversations owned by a user.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Owner user UUID.
 * @returns Number of active conversations.
 */
export async function countConversationsByUser(db: Sql, userId: string): Promise<number> {
  const rows = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM conversations
    WHERE user_id = ${userId}
      AND status = ${ROW_STATUS.ACTIVE}
  `;
  return rows[0]?.count ?? 0;
}
