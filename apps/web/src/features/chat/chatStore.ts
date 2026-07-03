/**
 * Client-side chat persistence (localStorage) until conversation APIs land in Phase 1+.
 * Starts empty — no seeded static conversations.
 */

import type { ChatMessage, ChatSession, NewChatInput, SendMessageResult } from "./chatTypes";

const STORAGE_KEY = "codesage-chat-v1";
const DEFAULT_TITLE = "New Chat";

interface ChatStoreState {
  sessions: ChatSession[];
  messagesBySession: Record<string, ChatMessage[]>;
}

let idCounter = 0;
let memoryState: ChatStoreState = { sessions: [], messagesBySession: {} };

/** Generates a short unique id with the given prefix. */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now()}-${idCounter}`;
}

/** Reads persisted chat state from localStorage when available. */
function loadState(): ChatStoreState {
  if (typeof window === "undefined" || !window.localStorage) {
    return structuredClone(memoryState);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { sessions: [], messagesBySession: {} };
    }
    const parsed = JSON.parse(raw) as ChatStoreState;
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      messagesBySession:
        parsed.messagesBySession && typeof parsed.messagesBySession === "object"
          ? parsed.messagesBySession
          : {},
    };
  } catch {
    return { sessions: [], messagesBySession: {} };
  }
}

/** Persists chat state to localStorage and the in-memory fallback. */
function saveState(state: ChatStoreState): void {
  memoryState = structuredClone(state);
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Clears chat storage. Call between tests for isolation. */
export function resetChatStore(): void {
  idCounter = 0;
  memoryState = { sessions: [], messagesBySession: {} };
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/** Lists chat sessions sorted by most recent activity (nulls last). */
export async function listSessions(): Promise<ChatSession[]> {
  const { sessions } = loadState();
  return [...sessions].sort((a, b) => {
    const aTime = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const bTime = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return bTime - aTime;
  });
}

/** Returns a single session by id, or null when not found. */
export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const { sessions } = loadState();
  return sessions.find((session) => session.id === sessionId) ?? null;
}

/** Returns messages for a session in creation order (empty when none). */
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const { messagesBySession } = loadState();
  return (messagesBySession[sessionId] ?? []).map((message) => ({ ...message }));
}

/**
 * Creates a new session scoped to a project. Title defaults to {@link DEFAULT_TITLE}
 * until the first LLM response supplies one via `generateTitle`.
 */
export async function createSession(input: NewChatInput): Promise<ChatSession> {
  const state = loadState();
  const session: ChatSession = {
    id: nextId("s"),
    title: DEFAULT_TITLE,
    mode: input.mode,
    projectId: input.projectId,
    projectName: input.projectName,
    messageCount: 0,
    lastMessageAt: null,
  };
  state.sessions = [session, ...state.sessions];
  state.messagesBySession[session.id] = [];
  saveState(state);
  return { ...session };
}

/**
 * Updates the session title (e.g. after the first LLM response emits a title chunk).
 */
export async function updateSessionTitle(sessionId: string, title: string): Promise<ChatSession> {
  const state = loadState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }
  session.title = title.trim() || DEFAULT_TITLE;
  saveState(state);
  return { ...session };
}

/**
 * Appends only the user message (assistant arrives after the stream completes).
 */
export async function appendUserMessage(
  sessionId: string,
  userMessage: ChatMessage,
): Promise<ChatSession> {
  const state = loadState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }
  state.messagesBySession[sessionId] = [
    ...(state.messagesBySession[sessionId] ?? []),
    userMessage,
  ];
  session.messageCount += 1;
  session.lastMessageAt = new Date().toISOString();
  saveState(state);
  return { ...session };
}

/**
 * Appends the assistant reply after streaming completes (user message already stored).
 */
export async function appendAssistantMessage(
  sessionId: string,
  assistantMessage: ChatMessage,
  title?: string,
): Promise<SendMessageResult> {
  const state = loadState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }
  const messages = state.messagesBySession[sessionId] ?? [];
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!userMessage) {
    throw new Error(`no user message in session: ${sessionId}`);
  }

  state.messagesBySession[sessionId] = [...messages, assistantMessage];
  session.messageCount += 1;
  session.lastMessageAt = new Date().toISOString();
  if (title?.trim()) {
    session.title = title.trim();
  }

  saveState(state);
  return { userMessage, assistantMessage, session: { ...session } };
}

/**
 * Appends a user/assistant message pair and optionally updates the session title.
 */
export async function appendMessagePair(
  sessionId: string,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage,
  title?: string,
): Promise<SendMessageResult> {
  const state = loadState();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error(`unknown session: ${sessionId}`);
  }

  state.messagesBySession[sessionId] = [
    ...(state.messagesBySession[sessionId] ?? []),
    userMessage,
    assistantMessage,
  ];
  session.messageCount += 2;
  session.lastMessageAt = new Date().toISOString();
  if (title?.trim()) {
    session.title = title.trim();
  }

  saveState(state);
  return { userMessage, assistantMessage, session: { ...session } };
}
