/**
 * TEMPORARY domain types for the mock data layer.
 *
 * These stand in for the real cross-service shapes until the Node API contract
 * (`contracts/openapi.node.yaml`) defines projects, chat, knowledge and reviews.
 * When those land, replace these with the generated `@codesage/shared-types`
 * equivalents and delete this file. Do not grow business logic around them.
 */

/** Indexing lifecycle state of a project. */
export type ProjectStatus = "indexed" | "indexing" | "connecting" | "error" | "stale";

/** Chat persona: code-level (developer) vs product/usage (end user). */
export type ChatMode = "developer" | "end_user";

/** Author of a chat message. */
export type MessageRole = "user" | "assistant";

/** A connected project (may aggregate multiple repositories). */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  repoCount: number;
  language: string | null;
}

/** A chat conversation, optionally scoped to a project. */
export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  projectId: string | null;
  projectName: string | null;
  messageCount: number;
  /** ISO-8601 UTC timestamp of the latest message, or null if none yet. */
  lastMessageAt: string | null;
}

/** A single message within a chat session. */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  /** Model self-rated confidence in [0, 1]; absent for user messages. */
  confidence?: number;
  /** Citation references (file paths / knowledge entries). */
  sources?: string[];
  /** True when low confidence routed the answer to expert review. */
  needsReview?: boolean;
}

/** Aggregate counters shown on the dashboard. */
export interface DashboardStats {
  projectCount: number;
  indexedProjectCount: number;
  sessionCount: number;
  knowledgeCount: number;
  pendingReviewCount: number;
}

/** Fields required to open a new conversation. */
export interface NewChatInput {
  title: string;
  mode: ChatMode;
  projectId: string | null;
}
