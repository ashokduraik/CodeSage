import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import { resetMockStore } from "@/shared/mock";
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
  }),
  parseChatSseLine: vi.fn(),
  formatCitationSource: vi.fn((c: { filePath: string }) => c.filePath),
}));

beforeEach(() => resetMockStore());

describe("chat query hooks", () => {
  it("lists sessions", async () => {
    const { result } = renderHook(() => useChatSessions(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.length).toBeGreaterThan(0);
  });

  it("loads a session when an id is given and stays idle otherwise", async () => {
    const disabled = renderHook(() => useChatSession(undefined), { wrapper: HookWrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => useChatSession("s1"), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBe("Auth flow questions");
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
      title: "New",
      mode: "developer",
      projectId: "p1",
    });
    expect(session.id).toBeTruthy();
    expect(session.projectName).toBe("acme/storefront");
  });

  it("sends a message and resolves with the stored pair", async () => {
    const { result } = renderHook(() => useSendMessage("s1"), { wrapper: HookWrapper });
    const outcome = await result.current.mutateAsync("What changed?");
    expect(outcome.userMessage.content).toBe("What changed?");
    expect(outcome.assistantMessage.role).toBe("assistant");
  });
});
