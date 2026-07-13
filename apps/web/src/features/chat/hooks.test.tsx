import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import { useChatSessions } from "./useChatSessions";
import { useChatSession } from "./useChatSession";
import { useChatMessages } from "./useChatMessages";
import { useProjects } from "./useProjects";
import { useCreateSession } from "./useCreateSession";
import { useSendMessage } from "./useSendMessage";
import { useDeleteSession } from "./useDeleteSession";

vi.mock("@/features/projects/projectsClient", () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    {
      id: "p1",
      name: "acme/storefront",
      status: "indexed",
      repoCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]),
}));

const mockListConversations = vi.fn().mockResolvedValue([]);
const mockGetConversation = vi.fn();
const mockListMessages = vi.fn();
const mockCreateConversation = vi.fn();
const mockDeleteConversation = vi.fn();
const mockStreamChatQuery = vi.fn();

vi.mock("./chatClient", () => ({
  listConversations: (...args: unknown[]) => mockListConversations(...args),
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  listConversationMessages: (...args: unknown[]) => mockListMessages(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
  streamChatQuery: (...args: unknown[]) => mockStreamChatQuery(...args),
  parseChatSseLine: vi.fn(),
  formatCitationSource: vi.fn((c: { filePath: string }) => c.filePath),
}));

beforeEach(() => {
  mockListConversations.mockResolvedValue([]);
  mockGetConversation.mockResolvedValue({
    id: "s1",
    title: "New Chat",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
    messageCount: 0,
    lastMessageAt: null,
  });
  mockListMessages.mockResolvedValue([
    {
      id: "m1",
      conversationId: "s1",
      role: "user",
      content: "hi",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "m2",
      conversationId: "s1",
      role: "assistant",
      content: "hello",
      createdAt: "2026-01-01T00:00:01.000Z",
    },
  ]);
  mockCreateConversation.mockResolvedValue({
    id: "s1",
    title: "New Chat",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
    messageCount: 0,
    lastMessageAt: null,
  });
  mockDeleteConversation.mockResolvedValue(undefined);
  mockStreamChatQuery.mockResolvedValue({
    content: "Mock answer",
    sources: ["src/auth.ts"],
    needsReview: false,
    confidence: 0.9,
    title: "Auth handler question",
    aborted: false,
  });
});

describe("chat query hooks", () => {
  it("lists sessions starting empty", async () => {
    const { result } = renderHook(() => useChatSessions(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("loads a session when an id is given and stays idle otherwise", async () => {
    const disabled = renderHook(() => useChatSession(undefined), { wrapper: HookWrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useChatSession("s1"), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBe("New Chat");
  });

  it("loads messages when an id is given and stays idle otherwise", async () => {
    const disabled = renderHook(() => useChatMessages(undefined), { wrapper: HookWrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useChatMessages("s1"), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it("lists projects", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.length).toBeGreaterThan(0);
  });
});

describe("chat mutation hooks", () => {
  it("creates a session", async () => {
    const { result } = renderHook(() => useCreateSession(), { wrapper: HookWrapper });
    const session = await result.current.mutateAsync({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    expect(session.id).toBeTruthy();
    expect(session.projectId).toBe("p1");
  });

  it("sends a message with conversationId and question", async () => {
    const { result } = renderHook(() => useSendMessage("s1"), { wrapper: HookWrapper });
    await result.current.mutateAsync("Where is auth?");
    expect(mockStreamChatQuery).toHaveBeenCalledWith(
      { conversationId: "s1", question: "Where is auth?" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("exposes stop to abort the in-flight stream", async () => {
    const { result } = renderHook(() => useSendMessage("s1"), { wrapper: HookWrapper });
    expect(typeof result.current.stop).toBe("function");
  });

  it("deletes a session by conversation id", async () => {
    const { result } = renderHook(() => useDeleteSession(), { wrapper: HookWrapper });
    await result.current.mutateAsync("s1");
    expect(mockDeleteConversation).toHaveBeenCalledWith("s1");
  });
});
