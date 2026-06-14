import { SEED_MESSAGES, SEED_PROJECTS, SEED_SESSIONS, SEED_STATS } from "./data";
import type {
  ChatMessage,
  ChatSession,
  DashboardStats,
  NewChatInput,
  Project,
} from "./types";

/**
 * In-memory mock backend standing in for `apps/api` until the real endpoints
 * and `contracts/` shapes exist. All functions are async to mirror the eventual
 * network layer so React Query hooks need no changes when wiring the real API.
 */

/** Confidence below this routes an answer to expert review (NFR-7 grounding). */
export const CONFIDENCE_THRESHOLD = 0.7;

let projects: Project[] = [];
let sessions: ChatSession[] = [];
let messagesBySession: Record<string, ChatMessage[]> = {};
let idCounter = 0;

/** Resets the mock store to its seeded state. Call between tests for isolation. */
export function resetMockStore(): void {
  projects = SEED_PROJECTS.map((p) => ({ ...p }));
  sessions = SEED_SESSIONS.map((s) => ({ ...s }));
  messagesBySession = Object.fromEntries(
    Object.entries(SEED_MESSAGES).map(([key, list]) => [key, list.map((m) => ({ ...m }))]),
  );
  idCounter = 0;
}

resetMockStore();

/** Generates a short unique id with the given prefix. */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now()}-${idCounter}`;
}

/** Lists connected projects, newest seed first. */
export async function listProjects(): Promise<Project[]> {
  return projects.map((p) => ({ ...p }));
}

/** Returns aggregate dashboard counters. */
export async function getDashboardStats(): Promise<DashboardStats> {
  return { ...SEED_STATS, projectCount: projects.length, sessionCount: sessions.length };
}

/** Lists chat sessions sorted by most recent activity (nulls last). */
export async function listSessions(): Promise<ChatSession[]> {
  return [...sessions].sort((a, b) => {
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bTime - aTime;
  });
}

/** Returns a single session by id, or null when not found. */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  return sessions.find((s) => s.id === sessionId) ?? null;
}

/** Returns the messages for a session in creation order (empty when none). */
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  return (messagesBySession[sessionId] ?? []).map((m) => ({ ...m }));
}

/** Creates a new session, resolving the project name from its id when provided. */
export async function createSession(input: NewChatInput): Promise<ChatSession> {
  const project = input.projectId ? (projects.find((p) => p.id === input.projectId) ?? null) : null;
  const session: ChatSession = {
    id: nextId("s"),
    title: input.title,
    mode: input.mode,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    messageCount: 0,
    lastMessageAt: null,
  };
  sessions = [session, ...sessions];
  messagesBySession[session.id] = [];
  return { ...session };
}

/**
 * Produces a deterministic mock answer. Answers without project context get a
 * low confidence so the expert-review fallback path is exercised.
 * @param text - The user's question.
 * @param session - The conversation the question belongs to.
 * @returns The answer body plus confidence, citations and the review flag.
 */
export function generateMockAnswer(
  text: string,
  session: ChatSession,
): { answer: string; confidence: number; sources: string[]; needsReview: boolean } {
  const hasProject = Boolean(session.projectName);
  const confidence = hasProject ? 0.88 : 0.55;
  const sources = hasProject ? [`${session.projectName}/src/index.ts`] : [];
  const answer =
    session.mode === "end_user"
      ? `To do that in ${session.projectName ?? "the app"}: ${text}`
      : `At the code level for "${text}", trace the relevant module and its callers.`;
  return { answer, confidence, sources, needsReview: confidence < CONFIDENCE_THRESHOLD };
}

/** Result of sending a message: the stored pair plus the updated session. */
export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  session: ChatSession;
}

/**
 * Appends a user message and a generated assistant reply to a session.
 * @param sessionId - Target session id.
 * @param text - The user's message text.
 * @returns The created messages and the mutated session.
 * @throws {Error} When the session does not exist.
 */
export async function sendMessage(sessionId: string, text: string): Promise<SendMessageResult> {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }

  const userMessage: ChatMessage = {
    id: nextId("m"),
    sessionId,
    role: "user",
    content: text,
  };
  const { answer, confidence, sources, needsReview } = generateMockAnswer(text, session);
  const assistantMessage: ChatMessage = {
    id: nextId("m"),
    sessionId,
    role: "assistant",
    content: answer,
    confidence,
    sources,
    needsReview,
  };

  messagesBySession[sessionId] = [
    ...(messagesBySession[sessionId] ?? []),
    userMessage,
    assistantMessage,
  ];
  session.messageCount += 2;
  session.lastMessageAt = new Date().toISOString();

  return { userMessage, assistantMessage, session: { ...session } };
}
