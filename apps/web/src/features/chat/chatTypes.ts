import type { NodeApi } from "@codesage/shared-types";

/** Chat persona from the Node API contract. */
export type ChatMode = NodeApi.components["schemas"]["ChatMode"];

/** Conversation metadata from the Node API contract. */
export type ChatSession = NodeApi.components["schemas"]["ChatSession"];

/** Stored message from the Node API contract. */
export type ChatMessage = NodeApi.components["schemas"]["ChatMessage"];

/** Per-answer metrics from the RAG stream. */
export type AnswerMetrics = NodeApi.components["schemas"]["AnswerMetrics"];

/** Code citation attached to assistant messages. */
export type CodeCitation = NodeApi.components["schemas"]["CodeCitation"];

/** Fields required to open a new conversation. */
export interface NewChatInput {
  mode: ChatMode;
  projectId: string;
  projectName: string;
}

/** Confidence below this routes an answer to expert review (NFR-7 grounding). */
export const CONFIDENCE_THRESHOLD = 0.7;
