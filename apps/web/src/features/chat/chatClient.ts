import { getAuthToken } from "@/shared/lib/authTokenStorage";
import type { NodeApi } from "@codesage/shared-types";

type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];
type ChatAnswerChunk = NodeApi.components["schemas"]["ChatAnswerChunk"];
type CodeCitation = NodeApi.components["schemas"]["CodeCitation"];
type AnswerMetrics = NodeApi.components["schemas"]["AnswerMetrics"];

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

/** Parsed result of a completed chat stream. */
export interface ChatStreamResult {
  content: string;
  sources: string[];
  needsReview: boolean;
  confidence: number;
  /** LLM-generated title when `generateTitle` was requested on the first message. */
  title?: string;
  /** Answer metrics (context window, tokens, tokens/sec) when the LLM path ran. */
  metrics?: AnswerMetrics;
}

/**
 * Parses one SSE `data:` JSON line into a chat answer chunk.
 * @param line - Raw SSE line (may include `data: ` prefix).
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
 * Streams a developer chat query via POST /chat/query (SSE).
 * @param body - Chat query request (question, projectId, audience).
 * @param onToken - Optional callback invoked for each streamed text fragment.
 * @returns Aggregated assistant message fields after the stream completes.
 */
export async function streamChatQuery(
  body: ChatQueryRequest,
  onToken?: (token: string) => void,
): Promise<ChatStreamResult> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(resolveApiUrl("/chat/query"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat query failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const sources: string[] = [];
  let needsReview = false;
  let title: string | undefined;
  let metrics: AnswerMetrics | undefined;

  for (;;) {
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
        onToken?.(chunk.content);
      }
      if (chunk.type === "citation" && chunk.citation) {
        sources.push(formatCitationSource(chunk.citation));
      }
      if (chunk.type === "abstain") {
        content = chunk.content ?? "Not certain — no sufficiently relevant code was retrieved.";
        needsReview = true;
      }
      if (chunk.type === "metrics" && chunk.metrics) {
        metrics = chunk.metrics;
      }
    }
  }

  const confidence = needsReview ? 0.4 : sources.length > 0 ? 0.9 : 0.75;
  return { content, sources, needsReview, confidence, title, metrics };
}
