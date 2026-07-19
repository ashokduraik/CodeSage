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
type PriorTurnEvidence = EngineApi.components["schemas"]["PriorTurnEvidence"];
type EvidenceAnchor = EngineApi.components["schemas"]["EvidenceAnchor"];

const DEFAULT_TITLE = "New Chat";
/** Cap prior-turn anchors sent to the engine (matches contract maxItems). */
const PRIOR_EVIDENCE_MAX_ITEMS = 20;

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
 * Drops empty/whitespace content — the engine ChatTurn schema requires minLength 1,
 * and aborted streams can leave citation-only rows with blank content.
 *
 * @param rows - Chronological message rows (excluding the current user turn).
 * @returns ChatTurn list oldest-first for the RAG request.
 */
export function buildHistoryFromMessages(rows: MessageRow[]): ChatTurn[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .filter((row) => row.content.trim().length > 0)
    .map((row) => ({
      role: row.role as ChatTurn["role"],
      content: row.content,
    }));
}

/**
 * Extracts follow-up retrieval anchors from the most recent grounded assistant turn.
 *
 * Walks messages newest-first and returns citations and/or
 * ``investigation_trace.evidenceAnchors`` from the first assistant row that has either.
 * Abstain / empty rows are skipped. History stays text-only; this payload is separate
 * so the engine can re-fetch those chunks (ADR 0028).
 *
 * @param rows - Chronological message rows (excluding the current user turn).
 * @returns PriorTurnEvidence for the engine request, or undefined when none.
 */
export function buildPriorEvidenceFromMessages(
  rows: MessageRow[],
): PriorTurnEvidence | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row || row.role !== "assistant") {
      continue;
    }
    const citations = Array.isArray(row.citations)
      ? (row.citations as CodeCitation[]).slice(0, PRIOR_EVIDENCE_MAX_ITEMS)
      : [];
    const trace =
      row.investigation_trace && typeof row.investigation_trace === "object"
        ? (row.investigation_trace as { evidenceAnchors?: unknown })
        : undefined;
    const anchors = Array.isArray(trace?.evidenceAnchors)
      ? (trace.evidenceAnchors as EvidenceAnchor[]).slice(0, PRIOR_EVIDENCE_MAX_ITEMS)
      : [];
    if (citations.length === 0 && anchors.length === 0) {
      continue;
    }
    const evidence: PriorTurnEvidence = {};
    if (citations.length > 0) {
      evidence.citations = citations;
    }
    if (anchors.length > 0) {
      evidence.evidenceAnchors = anchors;
    }
    return evidence;
  }
  return undefined;
}

/**
 * Returns AnswerMetrics without ``investigationTrace`` so the large trace is
 * stored only in ``messages.investigation_trace``.
 *
 * @param metrics - Accumulated metrics from the SSE stream (may include the trace).
 * @returns Metrics suitable for the ``metrics`` JSONB column, or undefined.
 */
export function metricsForPersistence(
  metrics: StreamAccumulator["metrics"],
): StreamAccumulator["metrics"] {
  if (!metrics) {
    return undefined;
  }
  const { investigationTrace: _trace, ...rest } = metrics as typeof metrics & {
    investigationTrace?: unknown;
  };
  return rest;
}

/**
 * Builds insert options for an assistant message from a completed stream accumulator.
 *
 * @param acc - Parsed stream accumulator.
 * @param stopped - Whether the client disconnected before completion.
 * @returns Options passed to ``insertMessage`` (undefined when content is empty).
 */
export function assistantPersistOptions(
  acc: StreamAccumulator,
  stopped: boolean,
):
  | {
      citations?: unknown;
      metrics?: unknown;
      investigationTrace?: unknown;
      needsReview?: boolean;
      stopped?: boolean;
    }
  | undefined {
  if (!acc.content.trim()) {
    return undefined;
  }
  return {
    citations: acc.citations.length > 0 ? acc.citations : undefined,
    metrics: metricsForPersistence(acc.metrics),
    investigationTrace: acc.investigationTrace,
    needsReview: acc.needsReview,
    stopped: stopped && !acc.completed,
  };
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
  const options = assistantPersistOptions(acc, stopped);
  if (!options) {
    return;
  }

  await insertMessage(db, conversationId, "assistant", acc.content.trim(), actorId, options);
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
  const priorEvidence = buildPriorEvidenceFromMessages(priorMessages);
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
        priorEvidence,
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
          // Flush so token SSE frames reach the browser as they arrive (not after done).
          const raw = reply.raw as typeof reply.raw & { flush?: () => void };
          raw.flush?.();
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

    // Persist before ending the SSE response so the client's post-stream message
    // refetch cannot race ahead of the assistant INSERT and wipe the optimistic answer.
    try {
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
    } catch (persistErr) {
      request.log.error(
        { err: persistErr, conversationId: body.conversationId, reqId: request.id },
        "chat SSE failed to persist assistant message",
      );
    }

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
    request.raw.off("close", onClientClose);
  }
}
