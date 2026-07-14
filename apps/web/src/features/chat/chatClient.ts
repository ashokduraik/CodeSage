import { apiFetch, ApiClientError, type ApiErrorBody } from "@/shared/lib/apiClient";
import { notifyUnauthorized } from "@/shared/lib/unauthorizedHandler";
import type { NodeApi } from "@codesage/shared-types";

type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];
type ChatAnswerChunk = NodeApi.components["schemas"]["ChatAnswerChunk"];
type CodeCitation = NodeApi.components["schemas"]["CodeCitation"];
type AnswerMetrics = NodeApi.components["schemas"]["AnswerMetrics"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];
type ChatMessage = NodeApi.components["schemas"]["ChatMessage"];
type CreateConversationRequest = NodeApi.components["schemas"]["CreateConversationRequest"];

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

/** Resolve an API path to an absolute URL (required for fetch in Node/jsdom tests). */
function resolveApiUrl(path: string): string {
  const base = BASE_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}${suffix}`;
  }
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
  return new URL(`${base}${suffix}`, origin).href;
}

/** Options for {@link streamChatQuery}. */
export interface StreamChatQueryOptions {
  /** Optional abort signal for stop-generation. */
  signal?: AbortSignal;
  /** Invoked for each streamed text fragment. */
  onToken?: (token: string) => void;
}

/** Parsed result of a completed or aborted chat stream. */
export interface ChatStreamResult {
  content: string;
  sources: string[];
  needsReview: boolean;
  confidence: number;
  /** LLM-generated title when the server requested title generation. */
  title?: string;
  /** Answer metrics when the LLM path ran. */
  metrics?: AnswerMetrics;
  /** True when the user stopped generation before completion. */
  aborted: boolean;
}

/**
 * Lists conversations for the authenticated user.
 * @returns Conversations ordered by recent activity.
 */
export async function listConversations(): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>("/conversations");
}

/**
 * Creates a conversation scoped to a project.
 * @param body - Mode and project scope.
 * @returns The created conversation metadata.
 */
export async function createConversation(body: CreateConversationRequest): Promise<ChatSession> {
  return apiFetch<ChatSession>("/conversations", { method: "POST", body });
}

/**
 * Returns one conversation by id.
 * @param conversationId - Conversation UUID.
 */
export async function getConversation(conversationId: string): Promise<ChatSession> {
  return apiFetch<ChatSession>(`/conversations/${conversationId}`);
}

/**
 * Soft-deletes a conversation.
 * @param conversationId - Conversation UUID.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch<void>(`/conversations/${conversationId}`, { method: "DELETE" });
}

/**
 * Lists messages in a conversation.
 * @param conversationId - Conversation UUID.
 */
export async function listConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/conversations/${conversationId}/messages`);
}

/**
 * Parses one SSE `data:` JSON line into a chat answer chunk.
 * @param line - Raw SSE line (may include `data:` prefix).
 * @returns Parsed chunk or null when the line is not a data event.
 */
export function parseChatSseLine(line: string): ChatAnswerChunk | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  const json = trimmed.slice(5).trim();
  if (!json) {
    return null;
  }
  return JSON.parse(json) as ChatAnswerChunk;
}

/**
 * Formats a code citation for display in the message bubble.
 * @param citation - Structured citation from the stream.
 */
export function formatCitationSource(citation: CodeCitation): string {
  return citation.filePath;
}

/**
 * Streams a chat query via POST /chat/query (SSE).
 * @param body - Chat query request (conversationId, question).
 * @param options - Abort signal and token callback.
 * @returns Aggregated assistant fields after the stream completes or aborts.
 */
export async function streamChatQuery(
  body: ChatQueryRequest,
  options: StreamChatQueryOptions = {},
): Promise<ChatStreamResult> {
  const { getAuthToken } = await import("@/shared/lib/authTokenStorage");
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl("/chat/query"), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      return {
        content: "",
        sources: [],
        needsReview: false,
        confidence: 0.75,
        aborted: true,
      };
    }
    throw error;
  }

  if (!response.ok) {
    let code = "REQUEST_ERROR";
    let message = response.statusText || `Chat query failed (${response.status})`;
    try {
      const errBody = (await response.json()) as ApiErrorBody;
      code = errBody.error?.code ?? code;
      message = errBody.error?.message ?? message;
    } catch {
      // Response body was not valid JSON; use defaults above.
    }
    if (response.status === 401) {
      notifyUnauthorized();
    }
    throw new ApiClientError(response.status, code, message);
  }

  if (!response.body) {
    throw new ApiClientError(502, "ENGINE_UNAVAILABLE", "Empty response from chat service.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const sources: string[] = [];
  let needsReview = false;
  let title: string | undefined;
  let metrics: AnswerMetrics | undefined;
  let aborted = false;
  let sawTerminal = false;
  let streamError: { code: string; message: string } | undefined;

  try {
    for (;;) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = parseChatSseLine(line);
        if (!chunk) {
          continue;
        }
        if (chunk.type === "title" && chunk.content) {
          title = chunk.content;
        }
        if (chunk.type === "token" && chunk.content) {
          content += chunk.content;
          options.onToken?.(chunk.content);
        }
        if (chunk.type === "citation" && chunk.citation) {
          sources.push(formatCitationSource(chunk.citation));
        }
        if (chunk.type === "abstain") {
          content = chunk.content ?? "Not certain — no sufficiently relevant code was retrieved.";
          needsReview = true;
          sawTerminal = true;
        }
        if (chunk.type === "metrics" && chunk.metrics) {
          metrics = chunk.metrics;
        }
        if (chunk.type === "done") {
          sawTerminal = true;
        }
        if (chunk.type === "error") {
          sawTerminal = true;
          streamError = {
            code: chunk.code ?? "STREAM_INTERRUPTED",
            message: chunk.content ?? "The answer stream was interrupted.",
          };
        }
      }
    }
  } catch (error) {
    if (options.signal?.aborted) {
      aborted = true;
    } else {
      throw error;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader may already be closed after abort.
    }
  }

  if (streamError) {
    throw new ApiClientError(502, streamError.code, streamError.message);
  }

  if (!aborted && !sawTerminal) {
    throw new ApiClientError(
      502,
      "STREAM_INTERRUPTED",
      "The answer stream ended before the reply finished.",
    );
  }

  const confidence = needsReview ? 0.4 : sources.length > 0 ? 0.9 : 0.75;
  return { content, sources, needsReview, confidence, title, metrics, aborted };
}
