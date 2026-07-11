import type { NodeApi } from "@codesage/shared-types";

/** Chat persona from the Node API contract. */
export type ChatMode = NodeApi.components["schemas"]["ChatMode"];

/** Conversation metadata stored client-side until a server API lands. */
export type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/** Per-answer metrics (context window, tokens, tokens/sec) from the RAG stream. */
export type AnswerMetrics = NodeApi.components["schemas"]["AnswerMetrics"];

/** Author of a chat message. */
export type MessageRole = "user" | "assistant";

/** A single message within a chat session (client-side persistence). */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  /** Model self-rated confidence in [0, 1]; absent for user messages. */
  confidence?: number;
  /** Citation references (file paths). */
  sources?: string[];
  /** True when low confidence routed the answer to expert review. */
  needsReview?: boolean;
  /** Answer metrics (context window, tokens, tokens/sec); absent for user messages. */
  metrics?: AnswerMetrics;
}

/** Fields required to open a new conversation. */
export interface NewChatInput {
  mode: ChatMode;
  projectId: string;
  projectName: string;
}

/** Result of sending a message: the stored pair plus the updated session. */
export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  session: ChatSession;
}

/** Confidence below this routes an answer to expert review (NFR-7 grounding). */
export const CONFIDENCE_THRESHOLD = 0.7;
