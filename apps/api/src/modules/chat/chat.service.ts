import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { NodeApi, EngineApi } from "@codesage/shared-types";
import type { Sql } from "../../platform/db";
import { postEngineQueryStream } from "../../platform/engineClient";
import { ApiError } from "../../platform/errors";
import type { JwtPayload } from "../../platform/auth.plugin";
import {
  countMessagesByConversation,
  findConversationByIdForUser,
  findConversationScopeForUser,
  findConversationsByUser,
  findMessagesByConversation,
  insertConversation,
  insertMessage,
  softDeleteConversation,
  updateConversationTitle,
  type ConversationRow,
  type MessageRow,
} from "./chat.repository";
import {
  createStreamAccumulator,
  feedSseBytes,
  formatSseErrorEvent,
  type StreamAccumulator,
} from "./chat.sse";

type ChatSession = NodeApi.components["schemas"]["ChatSession"];
type ChatMessage = NodeApi.components["schemas"]["ChatMessage"];
type ChatMode = NodeApi.components["schemas"]["ChatMode"];
type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];
type CreateConversationRequest = NodeApi.components["schemas"]["CreateConversationRequest"];
type ChatTurn = EngineApi.components["schemas"]["ChatTurn"];
type CodeCitation = NodeApi.components["schemas"]["CodeCitation"];

const DEFAULT_TITLE = "New Chat";

/**
 * Maps a conversation row to the public ChatSession API shape.
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
 * Maps a stored message row to the public ChatMessage API shape.
 *
 * @param row - Database message row.
 * @returns ChatMessage response object.
 */
function toChatMessage(row: MessageRow): ChatMessage {
  const citations = Array.isArray(row.citations)
    ? (row.citations as CodeCitation[])
    : undefined;
  const metrics = row.metrics && typeof row.metrics === "object"
    ? (row.metrics as ChatMessage["metrics"])
    : undefined;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    citations: citations?.length ? citations : undefined,
    metrics,
    needsReview: row.needs_review || undefined,
    stopped: row.stopped || undefined,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Builds LLM history turns from stored messages (user/assistant only).
 *
 * @param rows - Chronological message rows (excluding the current user turn).
 * @returns ChatTurn list oldest-first for the RAG request.
 */
function buildHistoryFromMessages(rows: MessageRow[]): ChatTurn[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as ChatTurn["role"],
      content: row.content,
    }));
}

/**
 * Persists the assistant answer accumulated from an SSE stream.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Parent conversation UUID.
 * @param actorId - Authenticated user UUID.
 * @param acc - Parsed stream accumulator.
 * @param stopped - Whether the client disconnected before completion.
 */
async function persistAssistantMessage(
  db: Sql,
  conversationId: string,
  actorId: string,
  acc: StreamAccumulator,
  stopped: boolean,
): Promise<void> {
  if (!acc.content && acc.citations.length === 0 && !acc.needsReview) {
    return;
  }

  await insertMessage(db, conversationId, "assistant", acc.content, actorId, {
    citations: acc.citations.length > 0 ? acc.citations : undefined,
    metrics: acc.metrics,
    needsReview: acc.needsReview,
    stopped: stopped && !acc.completed,
  });
}

/**
 * Lists conversations for the authenticated user.
 *
 * @param db - The postgres.js SQL client.
 * @param userId - Owner user UUID.
 * @returns Chat sessions ordered by recent activity.
 */
export async function listConversations(db: Sql, userId: string): Promise<ChatSession[]> {
  const rows = await findConversationsByUser(db, userId);
  return rows.map(toChatSession);
}

/**
 * Creates a conversation scoped to a project for the authenticated user.
 *
 * @param db - The postgres.js SQL client.
 * @param body - Create request with mode and projectId.
 * @param actorId - Authenticated user UUID.
 * @returns The created chat session.
 */
export async function createConversation(
  db: Sql,
  body: CreateConversationRequest,
  actorId: string,
): Promise<ChatSession> {
  if (!body.projectId || !body.mode) {
    throw new ApiError(400, "VALIDATION_ERROR", "mode and projectId are required.");
  }

  const row = await insertConversation(db, body.projectId, body.mode, actorId);
  const hydrated = await findConversationByIdForUser(db, row.id, actorId);
  if (!hydrated) {
    throw new ApiError(500, "INTERNAL_ERROR", "Failed to load created conversation.");
  }
  return toChatSession(hydrated);
}

/**
 * Returns one conversation when owned by the user.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @returns Chat session metadata.
 * @throws {@link ApiError} 404 when not found.
 */
export async function getConversation(
  db: Sql,
  conversationId: string,
  userId: string,
): Promise<ChatSession> {
  const row = await findConversationByIdForUser(db, conversationId, userId);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  }
  return toChatSession(row);
}

/**
 * Soft-deletes a conversation owned by the user.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @param actorId - Authenticated user UUID for audit columns.
 * @throws {@link ApiError} 404 when not found.
 */
export async function deleteConversation(
  db: Sql,
  conversationId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const deleted = await softDeleteConversation(db, conversationId, userId, actorId);
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  }
}

/**
 * Lists messages in a conversation owned by the user.
 *
 * @param db - The postgres.js SQL client.
 * @param conversationId - Conversation UUID.
 * @param userId - Owner user UUID.
 * @returns Chronological message list.
 * @throws {@link ApiError} 404 when the conversation is not found.
 */
export async function listConversationMessages(
  db: Sql,
  conversationId: string,
  userId: string,
): Promise<ChatMessage[]> {
  const scope = await findConversationScopeForUser(db, conversationId, userId);
  if (!scope) {
    throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  }
  const rows = await findMessagesByConversation(db, conversationId);
  return rows.map(toChatMessage);
}

/**
 * Proxies a chat query to RAG, persists messages, and pipes the SSE stream to the client.
 *
 * Mid-stream engine failures are turned into an SSE `error` event (HTTP status stays 200
 * after headers are sent). Cleanup awaits `reader.cancel()` so undici abort rejections
 * do not become unhandled and kill the process.
 *
 * @param app - Fastify instance (config + db).
 * @param request - Incoming request (JWT + disconnect detection).
 * @param body - Validated chat query request.
 * @param reply - Fastify reply to write the stream into.
 */
export async function streamChatQuery(
  app: FastifyInstance,
  request: FastifyRequest,
  body: ChatQueryRequest,
  reply: FastifyReply,
): Promise<void> {
  const { sub } = request.user as JwtPayload;
  const question = body.question?.trim();
  if (!question || !body.conversationId) {
    throw new ApiError(400, "VALIDATION_ERROR", "conversationId and question are required.");
  }

  const scope = await findConversationScopeForUser(app.db, body.conversationId, sub);
  if (!scope) {
    throw new ApiError(404, "NOT_FOUND", "Conversation not found.");
  }

  const priorCount = await countMessagesByConversation(app.db, body.conversationId);
  const priorMessages = await findMessagesByConversation(app.db, body.conversationId);
  const history = buildHistoryFromMessages(priorMessages);
  const generateTitle = priorCount === 0;

  await insertMessage(app.db, body.conversationId, "user", question, sub);

  const abortController = new AbortController();
  const onClientClose = () => {
    // Only abort the engine fetch for a real client disconnect while still writing.
    // Aborting during normal teardown races undici and can emit TypeError: terminated.
    if (!reply.raw.writableEnded && !reply.raw.writableFinished) {
      abortController.abort();
    }
  };
  request.raw.on("close", onClientClose);

  let engineResponse: Response;
  try {
    engineResponse = await postEngineQueryStream(
      app.config,
      {
        question,
        projectId: scope.project_id,
        audience: scope.audience as EngineApi.components["schemas"]["QueryAudience"],
        generateTitle,
        history: history.length > 0 ? history : undefined,
      },
      abortController.signal,
    );
  } catch (err) {
    request.raw.off("close", onClientClose);
    const message = err instanceof Error ? err.message : "Engine service unavailable";
    throw new ApiError(502, "ENGINE_UNAVAILABLE", message);
  }

  const forwardedHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    const lower = name.toLowerCase();
    if (value !== undefined && (lower.startsWith("access-control-") || lower === "vary")) {
      forwardedHeaders[name] = String(value);
    }
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...forwardedHeaders,
  });

  const acc = createStreamAccumulator();
  let lineBuffer = "";
  let clientDisconnected = false;
  let streamFailed = false;

  const reader = engineResponse.body!.getReader();
  try {
    for (;;) {
      if (abortController.signal.aborted) {
        clientDisconnected = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      lineBuffer = feedSseBytes(acc, lineBuffer, value);

      if (abortController.signal.aborted) {
        clientDisconnected = true;
        break;
      }

      if (!reply.raw.writableEnded) {
        try {
          reply.raw.write(value);
        } catch (writeErr) {
          streamFailed = true;
          clientDisconnected = true;
          request.log.warn(
            { err: writeErr, conversationId: body.conversationId, reqId: request.id },
            "chat SSE write failed",
          );
          break;
        }
      }
    }

    if (
      !clientDisconnected
      && !acc.completed
      && !acc.streamError
    ) {
      // Upstream closed without a terminal done/abstain/error chunk.
      streamFailed = true;
    }
  } catch (readErr) {
    streamFailed = true;
    if (abortController.signal.aborted) {
      clientDisconnected = true;
    } else {
      request.log.error(
        { err: readErr, conversationId: body.conversationId, reqId: request.id },
        "chat SSE engine stream failed",
      );
    }
  } finally {
    await reader.cancel().catch(() => {
      // Reader may already be closed when the upstream aborted.
    });

    if (
      streamFailed
      && !acc.streamError
      && !clientDisconnected
      && !reply.raw.writableEnded
    ) {
      const errorEvent = formatSseErrorEvent(
        "STREAM_INTERRUPTED",
        "The answer engine closed the stream before the reply finished.",
      );
      try {
        reply.raw.write(errorEvent);
      } catch {
        // Client may have gone away while writing the terminal error event.
      }
      acc.completed = true;
      acc.streamError = {
        code: "STREAM_INTERRUPTED",
        message: "The answer engine closed the stream before the reply finished.",
      };
    }

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
    request.raw.off("close", onClientClose);

    await persistAssistantMessage(
      app.db,
      body.conversationId,
      sub,
      acc,
      clientDisconnected || streamFailed,
    );

    if (acc.title?.trim()) {
      await updateConversationTitle(app.db, body.conversationId, acc.title.trim(), sub);
    }
  }
}
