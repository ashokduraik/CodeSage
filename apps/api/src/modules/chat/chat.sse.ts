import type { NodeApi } from "@codesage/shared-types";

type ChatAnswerChunk = NodeApi.components["schemas"]["ChatAnswerChunk"];
type CodeCitation = NodeApi.components["schemas"]["CodeCitation"];
type AnswerMetrics = NodeApi.components["schemas"]["AnswerMetrics"];

/** Accumulated fields parsed from an SSE answer stream. */
export interface StreamAccumulator {
  content: string;
  citations: CodeCitation[];
  title?: string;
  metrics?: AnswerMetrics;
  needsReview: boolean;
  /** True when done/abstain/error terminal chunk was seen. */
  completed: boolean;
  /** Set when an `error` chunk arrived (terminal transport/runtime failure). */
  streamError?: { code: string; message: string };
  /**
   * Optional investigation trace from the agent loop.
   * Populated when the engine sends a trace (plan 10 persists to `messages.investigation_trace`).
   */
  investigationTrace?: unknown;
}

/**
 * Parses one SSE `data:` JSON line into a chat answer chunk.
 *
 * @param line - Raw SSE line (may include a `data:` prefix).
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
 * Serializes one SSE error event for the chat client.
 *
 * @param code - Machine-readable error code.
 * @param content - Human-readable failure message.
 * @returns SSE `data:` line including trailing newlines.
 */
export function formatSseErrorEvent(code: string, content: string): string {
  return `data: ${JSON.stringify({ type: "error", code, content })}\n\n`;
}

/**
 * Applies one parsed chunk to the running accumulator.
 *
 * @param acc - Mutable accumulator updated in place.
 * @param chunk - Parsed SSE chunk from the RAG stream.
 */
export function applyChatChunk(acc: StreamAccumulator, chunk: ChatAnswerChunk): void {
  // Agent progress events — proxy through to clients; do not mutate answer content/citations.
  if (chunk.type === "tool_start" || chunk.type === "tool_result") {
    return;
  }
  if (chunk.type === "title" && chunk.content) {
    acc.title = chunk.content;
  }
  if (chunk.type === "token" && chunk.content) {
    acc.content += chunk.content;
  }
  if (chunk.type === "citation" && chunk.citation) {
    acc.citations.push(chunk.citation);
  }
  if (chunk.type === "abstain") {
    acc.content =
      chunk.content ?? "Not certain — no sufficiently relevant code was retrieved.";
    acc.needsReview = true;
    acc.completed = true;
  }
  if (chunk.type === "metrics" && chunk.metrics) {
    // Pass through all metric fields (including agentIterations / evidenceConfidence / toolCallCount).
    acc.metrics = chunk.metrics;
  }
  if (chunk.type === "done") {
    acc.completed = true;
  }
  if (chunk.type === "error") {
    acc.completed = true;
    acc.streamError = {
      code: chunk.code ?? "STREAM_INTERRUPTED",
      message: chunk.content ?? "The answer stream was interrupted.",
    };
  }
}

/**
 * Creates an empty stream accumulator for a new chat answer.
 *
 * @returns Fresh accumulator with zeroed fields.
 */
export function createStreamAccumulator(): StreamAccumulator {
  return {
    content: "",
    citations: [],
    needsReview: false,
    completed: false,
  };
}

/**
 * Feeds raw SSE bytes into the line buffer and applies parsed chunks.
 *
 * @param acc - Running accumulator for the answer.
 * @param buffer - Carry-over partial line from the previous chunk.
 * @param bytes - New UTF-8 bytes from the upstream stream.
 * @returns Updated line buffer after processing complete lines.
 */
export function feedSseBytes(acc: StreamAccumulator, buffer: string, bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const combined = buffer + text;
  const lines = combined.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const chunk = parseChatSseLine(line);
    if (chunk) {
      applyChatChunk(acc, chunk);
    }
  }
  return remainder;
}
