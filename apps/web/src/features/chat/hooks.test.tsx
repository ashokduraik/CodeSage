import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import {
  appendMessagePair,
  createSession,
  resetChatStore,
} from "./chatStore";
import { useChatSessions } from "./useChatSessions";
import { useChatSession } from "./useChatSession";
import { useChatMessages } from "./useChatMessages";
import { useProjects } from "./useProjects";
import { useCreateSession } from "./useCreateSession";
import { useSendMessage } from "./useSendMessage";

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

vi.mock("./chatClient", () => ({
  streamChatQuery: vi.fn().mockResolvedValue({
    content: "Mock answer",
    sources: ["src/auth.ts"],
    needsReview: false,
    confidence: 0.9,
    title: "Auth handler question",
  }),
  parseChatSseLine: vi.fn(),
  formatCitationSource: vi.fn((c: { filePath: string }) => c.filePath),
}));

beforeEach(() => resetChatStore());

describe("chat query hooks", () => {
  it("lists sessions starting empty", async () => {
    const { result } = renderHook(() => useChatSessions(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("loads a session when an id is given and stays idle otherwise", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });

    const disabled = renderHook(() => useChatSession(undefined), { wrapper: HookWrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useChatSession(session.id), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBe("New Chat");
  });

  it("loads messages when an id is given and stays idle otherwise", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    await appendMessagePair(
      session.id,
      { id: "m1", sessionId: session.id, role: "user", content: "hi" },
      { id: "m2", sessionId: session.id, role: "assistant", content: "hello" },
    );

    const disabled = renderHook(() => useChatMessages(undefined), { wrapper: HookWrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useChatMessages(session.id), { wrapper: HookWrapper });
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
    expect(session.projectName).toBe("acme/storefront");
  });

  it("sends the first message with generateTitle and stores the returned title", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    const { streamChatQuery } = await import("./chatClient");

    const { result } = renderHook(() => useSendMessage(session.id), { wrapper: HookWrapper });
    const outcome = await result.current.mutateAsync("Where is auth?");
    expect(outcome.userMessage.content).toBe("Where is auth?");
    expect(outcome.assistantMessage.role).toBe("assistant");
    expect(outcome.session.title).toBe("Auth handler question");
    expect(streamChatQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Where is auth?",
        generateTitle: true,
      }),
      expect.any(Function),
    );
  });

  it("throws when the session is missing or lacks a project", async () => {
    const { result } = renderHook(() => useSendMessage("missing"), { wrapper: HookWrapper });
    await expect(result.current.mutateAsync("hi")).rejects.toThrow(/unknown session/);
  });
});
